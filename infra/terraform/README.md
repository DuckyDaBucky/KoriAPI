# KoriAPI Terraform

Terraform entrypoint for the modular-monolith deployment target:

- `api` ECS Fargate service
- `dashboard` ECS Fargate service
- `worker` ECS Fargate service
- ALB + HTTPS listener
- CloudWatch log groups and alarms
- S3 document asset bucket
- Secrets Manager references for runtime secrets
- VPC/security groups/subnets wiring

This scaffold is intentionally minimal but organized for `local`, `staging`, and `production` profiles.
