---
title: Mac 端用 Terraform 申请阿里云抢占式 ECS 并搭建 Sing-box
date: 2026-07-18
tags: [Terraform, 阿里云, ECS, Sing-box, Mac]
---

**TL;DR:** 这篇文档演示如何在 Mac 终端用 Terraform 创建阿里云抢占式 ECS，并通过实例初始化脚本自动安装 Sing-box。重点不是“点控制台”，而是把 VPC、交换机、安全组、SSH 密钥、ECS 实例和初始化脚本都代码化，方便重复创建和一键销毁。

本文假设你熟悉 Mac 终端的基本操作，已经有阿里云账号，并了解抢占式实例可能被回收的特性。请只在合法合规的网络环境中使用本文配置，部署完成后记得评估安全组暴露范围和持续计费风险。

## 最终效果

完成后你会得到：

- 一台阿里云新加坡区域的抢占式 ECS
- 一套自动创建的 VPC、交换机和安全组
- 一个导入到阿里云的 SSH KeyPair
- 一个使用 Ubuntu 22.04 镜像启动的实例
- 开机自动执行的 Sing-box 安装脚本
- 可通过 `terraform destroy` 一键销毁的完整资源栈

## 前置条件

### 安装 Terraform

Mac 上如果已经安装 Homebrew，直接执行：

```bash
brew install terraform
terraform version
```

### 配置阿里云 AccessKey

建议使用 RAM 子账号创建 AccessKey，并按最小权限原则授权。不要把 AccessKey 写入代码仓库。

```bash
vim ~/.zshrc
```

写入以下环境变量，替换成你自己的值：

```bash
export ALICLOUD_ACCESS_KEY="你的 AccessKey ID"
export ALICLOUD_SECRET_KEY="你的 AccessKey Secret"
```

让配置立即生效：

```bash
source ~/.zshrc
```

### 准备 SSH 公钥

如果本地还没有 SSH 密钥，可以生成一对：

```bash
ssh-keygen
ls ~/.ssh/id_rsa.pub
```

下面的 Terraform 配置默认读取 `~/.ssh/id_rsa.pub`，并把它导入为阿里云 KeyPair。

## 关键避坑点

这套配置主要解决几个常见问题：

1. **磁盘规格不兼容**：入门规格 ECS 可能不支持 ESSD，因此统一使用 `cloud_ssd`。
2. **实例规格无库存**：新加坡区域优先使用 `ecs.n1.small`，可用性相对稳定。
3. **系统初始化卡住**：`user_data` 中设置非交互模式，并处理 `dpkg` 锁。
4. **软件安装网络失败**：安全组显式放行出站流量，避免 `apt` 和脚本下载被阻断。
5. **密码登录风险**：通过 SSH KeyPair 登录，避免在实例上配置明文密码。

## 编写 Terraform 配置

新建项目目录：

```bash
mkdir ecs-vpn
cd ecs-vpn
touch main.tf
```

把下面内容写入 `main.tf`：

```hcl
variable "region" {
  default = "ap-southeast-1"
}

provider "alicloud" {
  region = var.region
}

variable "instance_type" {
  type    = string
  default = "ecs.n1.small"
}

variable "vpc_cidr_block" {
  default = "172.16.0.0/16"
}

variable "vsw_cidr_block" {
  default = "172.16.0.0/24"
}

variable "vpc_name_prefix" {
  default = "vpc-test_"
}

variable "local_ssh_pubkey_path" {
  default     = "~/.ssh/id_rsa.pub"
  description = "本地 SSH 公钥路径"
}

resource "random_integer" "default" {
  min = 10000
  max = 99999
}

locals {
  full_vpc_name = "${var.vpc_name_prefix}${random_integer.default.result}"
  key_pair_name = "ecs-ssh-key-${random_integer.default.result}"
}

data "alicloud_vpcs" "exist_vpc" {
  cidr_block = var.vpc_cidr_block
  name_regex = "^${var.vpc_name_prefix}.*"
}

resource "alicloud_vpc" "auto_vpc" {
  count      = length(data.alicloud_vpcs.exist_vpc.vpcs) > 0 ? 0 : 1
  vpc_name   = local.full_vpc_name
  cidr_block = var.vpc_cidr_block
}

locals {
  target_vpc_id = length(data.alicloud_vpcs.exist_vpc.vpcs) > 0 ? data.alicloud_vpcs.exist_vpc.vpcs[0].id : alicloud_vpc.auto_vpc[0].id
}

data "alicloud_zones" "default" {}

data "alicloud_images" "ubuntu2204" {
  name_regex  = "^ubuntu_22_04_x64_20G_alibase_.*"
  most_recent = true
  owners      = "system"
}

resource "alicloud_key_pair" "ecs_ssh_key" {
  key_pair_name = local.key_pair_name
  public_key    = file(var.local_ssh_pubkey_path)
}

resource "alicloud_security_group" "group" {
  security_group_name = "test-sg-${random_integer.default.result}"
  vpc_id              = local.target_vpc_id
}

resource "alicloud_security_group_rule" "allow_ssh" {
  type              = "ingress"
  ip_protocol       = "tcp"
  nic_type          = "intranet"
  policy            = "accept"
  port_range        = "22/22"
  priority          = 1
  security_group_id = alicloud_security_group.group.id
  cidr_ip           = "0.0.0.0/0"
  description       = "SSH login"
}

resource "alicloud_security_group_rule" "allow_singbox_admin" {
  type              = "ingress"
  ip_protocol       = "tcp"
  nic_type          = "intranet"
  policy            = "accept"
  port_range        = "22017/22017"
  priority          = 100
  security_group_id = alicloud_security_group.group.id
  cidr_ip           = "0.0.0.0/0"
  description       = "Sing-box admin port"
}

resource "alicloud_security_group_rule" "allow_all_out" {
  type              = "egress"
  ip_protocol       = "all"
  nic_type          = "intranet"
  policy            = "accept"
  port_range        = "-1/-1"
  priority          = 100
  security_group_id = alicloud_security_group.group.id
  cidr_ip           = "0.0.0.0/0"
  description       = "Allow all outbound traffic"
}

resource "alicloud_vswitch" "vswitch" {
  vpc_id       = local.target_vpc_id
  cidr_block   = var.vsw_cidr_block
  zone_id      = data.alicloud_zones.default.zones[0].id
  vswitch_name = "vsw-test-${random_integer.default.result}"
}

resource "alicloud_instance" "instance" {
  availability_zone          = data.alicloud_zones.default.zones[0].id
  security_groups            = [alicloud_security_group.group.id]
  instance_type              = var.instance_type
  system_disk_category       = "cloud_ssd"
  system_disk_name           = "sys-disk-${random_integer.default.result}"
  system_disk_description    = "Ubuntu system disk"
  image_id                   = data.alicloud_images.ubuntu2204.images[0].id
  instance_name              = "spot-ecs-vpn-${random_integer.default.result}"
  vswitch_id                 = alicloud_vswitch.vswitch.id
  internet_max_bandwidth_out = 10
  key_name                   = alicloud_key_pair.ecs_ssh_key.key_pair_name

  spot_strategy    = "SpotAsPriceGo"
  spot_price_limit = "0.0"

  user_data = <<-EOF
              #!/bin/bash
              set -e
              export DEBIAN_FRONTEND=noninteractive
              exec > /var/log/singbox-install.log 2>&1

              dpkg --configure -a || true
              rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock

              apt update -y || true
              apt install -y wget curl

              bash <(wget -qO- https://github.com/233boy/sing-box/raw/main/install.sh)
              EOF
}

output "ecs_public_ip" {
  value = alicloud_instance.instance.public_ip
}

output "key_pair_name" {
  value = alicloud_key_pair.ecs_ssh_key.key_pair_name
}
```

如果你不想让 SSH 暴露给全网，把 `allow_ssh.cidr_ip` 改成自己的公网 IP，例如：

```hcl
cidr_ip = "203.0.113.10/32"
```

## 执行部署

初始化 Terraform Provider：

```bash
terraform init
```

预览即将创建的资源：

```bash
terraform plan
```

确认没有问题后执行：

```bash
terraform apply
```

Terraform 会提示输入确认，输入 `yes` 后开始创建资源。部署完成后会输出：

```text
ecs_public_ip = "你的公网 IP"
key_pair_name = "ecs-ssh-key-xxxxx"
```

## 登录服务器与检查服务

使用 Terraform 输出的公网 IP 登录：

```bash
ssh root@你的公网IP
```

如果 Sing-box 没有按预期安装，先看初始化日志：

```bash
cat /var/log/singbox-install.log
```

常用管理命令：

```bash
sb status
sb restart
sb edit
```

## 销毁资源

抢占式实例虽然便宜，但只要资源存在就可能持续计费。不使用时在 Terraform 项目目录执行：

```bash
terraform destroy
```

确认资源列表无误后输入 `yes`。

## 常见问题

### InvalidInstanceType.NotSupportDiskCategory

通常是实例规格不支持所选系统盘类型。本文使用 `cloud_ssd`，比 ESSD 对入门实例更兼容。

### 实例规格无售卖或库存不足

抢占式实例本身依赖区域和可用区库存。如果 `ecs.n1.small` 不可用，可以更换 `instance_type`，再执行：

```bash
terraform plan
terraform apply
```

### apt update 或安装脚本卡住

优先查看：

```bash
cat /var/log/singbox-install.log
```

如果是网络下载失败，检查安全组出站规则和实例到 GitHub、Ubuntu 源的连通性。

### 安全组是否应该全网开放

本文为了降低部署门槛，示例中 SSH 和管理端口使用了 `0.0.0.0/0`。正式使用建议至少收紧 SSH 来源 IP，并按实际客户端需求开放端口。

## 取舍

这套方案的优势是成本低、可重复部署、资源清理简单；代价是抢占式实例可能被释放，第三方安装脚本也需要你自行审计和接受维护风险。

如果你要长期稳定运行，建议把抢占式实例换成普通按量或包年包月实例，并把 Sing-box 配置纳入自己的版本管理。
