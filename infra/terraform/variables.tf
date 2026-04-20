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

variable "dashboard_image" {
  type = string
}

variable "api_image" {
  type = string
}

variable "worker_image" {
  type = string
}

variable "certificate_arn" {
  type = string
}

variable "neon_database_url_secret_arn" {
  type = string
}

variable "redis_url_secret_arn" {
  type = string
}

variable "admin_api_key_secret_arn" {
  type = string
}

variable "app_encryption_key_secret_arn" {
  type = string
}
