# KoriAPI Terraform

Terraform entrypoint for the staging modular-monolith topology:

- one ECS Fargate `api` service
- one ECS Fargate `dashboard` service
- one ECS Fargate `worker` service
- ALB with HTTP redirect and HTTPS termination
- public VPC/subnet layout for staging
- ElastiCache Redis
- S3 document asset bucket
- CloudWatch log groups and ECS alarms
- Secrets Manager-backed runtime secret injection

## Required inputs

Populate [staging.tfvars.example](/c:/Users/hasna/Documents/KoriAPI/infra/terraform/staging.tfvars.example) with:

- image URIs for `api`, `dashboard`, and `worker`
- `public_base_url`
- ACM certificate ARN
- Secrets Manager ARNs for:
  - `DATABASE_URL`
  - `ADMIN_API_KEY`
  - `APP_ENCRYPTION_KEY`
  - `BETTER_AUTH_SECRET`
  - optional Spotify secrets

## Apply flow

```bash
terraform init
terraform plan -var-file=staging.tfvars
terraform apply -var-file=staging.tfvars
```

## Post-apply checks

1. Open the ALB URL and verify the dashboard responds.
2. Check `${public_base_url}/health`.
3. Log into the dashboard and confirm `/v1/admin/overview` data loads.
4. Inspect CloudWatch logs for `api`, `dashboard`, and `worker`.
5. Verify Redis, document bucket, and job processing from the worker service.
