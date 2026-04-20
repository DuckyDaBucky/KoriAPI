variable "project" {
  type    = string
  default = "koriapi"
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.40.1.0/24", "10.40.2.0/24"]
}

variable "api_image" {
  type = string
}

variable "dashboard_image" {
  type = string
}

variable "worker_image" {
  type = string
}

variable "certificate_arn" {
  type = string
}

variable "public_base_url" {
  type = string
}

variable "api_container_port" {
  type    = number
  default = 3001
}

variable "dashboard_container_port" {
  type    = number
  default = 3000
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "dashboard_cpu" {
  type    = number
  default = 512
}

variable "dashboard_memory" {
  type    = number
  default = 1024
}

variable "worker_cpu" {
  type    = number
  default = 512
}

variable "worker_memory" {
  type    = number
  default = 1024
}

variable "desired_count_api" {
  type    = number
  default = 1
}

variable "desired_count_dashboard" {
  type    = number
  default = 1
}

variable "desired_count_worker" {
  type    = number
  default = 1
}

variable "neon_database_url_secret_arn" {
  type = string
}

variable "admin_api_key_secret_arn" {
  type = string
}

variable "app_encryption_key_secret_arn" {
  type = string
}

variable "better_auth_secret_arn" {
  type    = string
  default = ""
}

variable "spotify_client_id_secret_arn" {
  type    = string
  default = ""
}

variable "spotify_client_secret_secret_arn" {
  type    = string
  default = ""
}

variable "seed_user_email" {
  type    = string
  default = "owner@example.com"
}

variable "seed_user_name" {
  type    = string
  default = "Kori Owner"
}

variable "seed_workspace_name" {
  type    = string
  default = "Kori Default Workspace"
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "worker_poll_interval_ms" {
  type    = number
  default = 5000
}
