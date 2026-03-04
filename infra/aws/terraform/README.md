# AWS Terraform Stack (ECS EC2)

This stack deploys the full Edward runtime to AWS with Docker-socket-compatible hosts:

- ALB (edge ingress)
- ECS cluster on EC2 (web, api, worker services)
- RDS PostgreSQL
- ElastiCache Redis
- S3 source bucket
- CDN assets from either:
  - Terraform-managed S3 + CloudFront in the app account, or
  - external-account S3 + CloudFront (set `use_external_cdn=true`)
- ECR repositories for `api` and `web`

## Why ECS on EC2?

Edward sandbox execution depends on Docker runtime access (`/var/run/docker.sock`).
ECS Fargate cannot expose host Docker socket, so ECS on EC2 is used for full feature parity.

## Quick Start

1. Copy and customize `terraform.tfvars.example`.
2. Initialize and apply:

```bash
cd infra/aws/terraform
terraform init
terraform apply
```

3. Build and push images to the output ECR repos.
4. Re-apply Terraform with updated image tags (`api_image`, `web_image`) to roll out new task definitions.

## Notes

- Recommended production ingress uses host-based routing with `domain_name=edwardd.app`, `api_domain_name=api.edwardd.app`, and `api_path_prefix=""`.
- If `api_domain_name` is not set, Terraform falls back to shared-domain path routing at `API_BASE_PATH` (`/backend` by default).
- When HTTPS is enabled, use an ACM certificate that covers both hostnames.
- External CDN mode requires these tfvars values:
  - `use_external_cdn=true`
  - `external_cdn_bucket_name`
  - `external_cloudfront_distribution_id`
  - `external_cloudfront_distribution_url`
  - `external_cloudfront_distribution_arn`
  - `external_cloudfront_role_arn`
- In external CDN mode, app-account ECS task role permissions are created automatically, and API/worker tasks assume `external_cloudfront_role_arn` for CloudFront API calls.
- CDN-account S3 bucket policy must still allow the app-account ECS task role for object put/get/delete/list.
- In production, API logs are silent by design (`apps/api/utils/logger.ts`).
- Secrets should be injected via `api_secrets`, `worker_secrets`, and `web_secrets` using ECS `valueFrom` ARNs.
- Default task CPU reservations are sized so `api + worker + web` fit on one `t4g.large` host.
