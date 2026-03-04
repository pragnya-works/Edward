variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Project slug used in AWS resource names."
  type        = string
  default     = "edward"
}

variable "environment" {
  description = "Deployment environment name (for example: prod, staging)."
  type        = string
  default     = "prod"
}

variable "vpc_cidr" {
  description = "CIDR block for the deployment VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "availability_zones_count" {
  description = "Number of AZs to spread public/private subnets across."
  type        = number
  default     = 2

  validation {
    condition     = var.availability_zones_count >= 2
    error_message = "availability_zones_count must be at least 2 for RDS/ElastiCache subnet groups."
  }
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs. Must match availability_zones_count."
  type        = list(string)
  default     = ["10.42.0.0/20", "10.42.16.0/20"]

  validation {
    condition     = length(var.public_subnet_cidrs) == var.availability_zones_count
    error_message = "public_subnet_cidrs length must equal availability_zones_count."
  }
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDRs for data services. Must match availability_zones_count."
  type        = list(string)
  default     = ["10.42.128.0/20", "10.42.144.0/20"]

  validation {
    condition     = length(var.private_subnet_cidrs) == var.availability_zones_count
    error_message = "private_subnet_cidrs length must equal availability_zones_count."
  }
}

variable "instance_type" {
  description = "ECS container host EC2 instance type."
  type        = string
  default     = "t4g.large"
}

variable "ec2_key_name" {
  description = "Optional EC2 key pair name for direct SSH access."
  type        = string
  default     = null
}

variable "ssh_ingress_cidrs" {
  description = "Optional CIDRs allowed to SSH to ECS hosts. Leave empty to disable SSH ingress."
  type        = list(string)
  default     = []
}

variable "asg_min_size" {
  description = "Minimum ECS host count."
  type        = number
  default     = 1
}

variable "asg_desired_size" {
  description = "Desired ECS host count."
  type        = number
  default     = 1
}

variable "asg_max_size" {
  description = "Maximum ECS host count."
  type        = number
  default     = 2
}

variable "api_image" {
  description = "Full container image URI for API/worker task definition."
  type        = string
}

variable "web_image" {
  description = "Full container image URI for web task definition."
  type        = string
}

variable "api_path_prefix" {
  description = "Optional path prefix exposed through ALB to API service (for example: /backend). Leave empty for root API paths."
  type        = string
  default     = ""
}

variable "api_container_port" {
  description = "API container and host port."
  type        = number
  default     = 8000
}

variable "web_container_port" {
  description = "Web container and host port."
  type        = number
  default     = 3000
}

variable "api_task_cpu" {
  description = "API task CPU units."
  type        = number
  default     = 768
}

variable "api_task_memory" {
  description = "API task memory (MiB)."
  type        = number
  default     = 2048
}

variable "worker_task_cpu" {
  description = "Worker task CPU units."
  type        = number
  default     = 512
}

variable "worker_task_memory" {
  description = "Worker task memory (MiB)."
  type        = number
  default     = 2048
}

variable "web_task_cpu" {
  description = "Web task CPU units."
  type        = number
  default     = 256
}

variable "web_task_memory" {
  description = "Web task memory (MiB)."
  type        = number
  default     = 1024
}

variable "enable_https" {
  description = "Enable HTTPS listener on ALB."
  type        = bool
  default     = false
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS listener (required when enable_https=true)."
  type        = string
  default     = null
}

variable "domain_name" {
  description = "Optional DNS name for the app (for example app.example.com)."
  type        = string
  default     = null
}

variable "api_domain_name" {
  description = "Optional DNS name for the API (for example api.example.com). When set, ALB host-based routing is configured to the API service."
  type        = string
  default     = null
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for domain_name alias record (optional)."
  type        = string
  default     = null
}

variable "cloudfront_web_acl_arn" {
  description = "WAFv2 Web ACL ARN for managed CloudFront distribution. Required when use_external_cdn=false."
  type        = string
  default     = ""

  validation {
    condition = (
      trim(var.cloudfront_web_acl_arn, " ") == "" ||
      can(regex("^arn:aws:wafv2:us-east-1:[0-9]{12}:global/webacl/.+", trim(var.cloudfront_web_acl_arn, " ")))
    )
    error_message = "cloudfront_web_acl_arn must be a valid us-east-1 global WAFv2 WebACL ARN."
  }
}

variable "use_external_cdn" {
  description = "When true, use an existing external-account S3+CloudFront CDN instead of Terraform-managed CDN resources."
  type        = bool
  default     = false
}

variable "external_cdn_bucket_name" {
  description = "Existing external CDN S3 bucket name used for public asset uploads when use_external_cdn=true."
  type        = string
  default     = ""
}

variable "external_cloudfront_distribution_id" {
  description = "Existing external CloudFront distribution id used for cache invalidations when use_external_cdn=true."
  type        = string
  default     = ""

  validation {
    condition = (
      var.external_cloudfront_distribution_id == "" ||
      can(regex("^[A-Z0-9]+$", var.external_cloudfront_distribution_id))
    )
    error_message = "external_cloudfront_distribution_id must contain only uppercase letters and digits."
  }
}

variable "external_cloudfront_distribution_url" {
  description = "Public HTTPS base URL for external CDN assets (for example https://d111111abcdef8.cloudfront.net)."
  type        = string
  default     = ""

  validation {
    condition = (
      var.external_cloudfront_distribution_url == "" ||
      can(regex("^https://[^/]+/?$", trim(var.external_cloudfront_distribution_url, " ")))
    )
    error_message = "external_cloudfront_distribution_url must be an https URL with host only (no path)."
  }
}

variable "external_cloudfront_distribution_arn" {
  description = "ARN of the external CloudFront distribution used for least-privilege IAM when use_external_cdn=true."
  type        = string
  default     = ""

  validation {
    condition = (
      var.external_cloudfront_distribution_arn == "" ||
      can(regex("^arn:aws:cloudfront::[0-9]{12}:distribution/[A-Z0-9]+$", trim(var.external_cloudfront_distribution_arn, " ")))
    )
    error_message = "external_cloudfront_distribution_arn must be a valid CloudFront distribution ARN."
  }
}

variable "external_cloudfront_role_arn" {
  description = "Cross-account role ARN in the CDN account that ECS tasks can assume to call CloudFront APIs (GetDistribution/CreateInvalidation)."
  type        = string
  default     = ""

  validation {
    condition = (
      var.external_cloudfront_role_arn == "" ||
      can(regex("^arn:aws:iam::[0-9]{12}:role/.+", trim(var.external_cloudfront_role_arn, " ")))
    )
    error_message = "external_cloudfront_role_arn must be a valid IAM role ARN."
  }
}

variable "db_name" {
  description = "Postgres database name."
  type        = string
  default     = "edward"
}

variable "db_username" {
  description = "Postgres master username."
  type        = string
  default     = "edward"
}

variable "db_password" {
  description = "Postgres master password."
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Initial RDS allocated storage in GiB."
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "RDS autoscaling storage upper bound in GiB."
  type        = number
  default     = 100
}

variable "db_backup_retention_days" {
  description = "RDS automated backup retention in days."
  type        = number
  default     = 7
}

variable "db_maintenance_window" {
  description = "Preferred weekly maintenance window for RDS (UTC)."
  type        = string
  default     = "sun:16:00-sun:17:00"
}

variable "db_deletion_protection" {
  description = "Enable deletion protection on RDS instance."
  type        = bool
  default     = true
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type."
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_engine_version" {
  description = "ElastiCache Redis engine version."
  type        = string
  default     = "7.1"
}

variable "redis_num_cache_clusters" {
  description = "Number of Redis cache clusters in the replication group."
  type        = number
  default     = 2

  validation {
    condition     = var.redis_num_cache_clusters >= 2
    error_message = "redis_num_cache_clusters must be at least 2 when automatic failover is enabled."
  }
}

variable "redis_snapshot_retention_limit" {
  description = "Days to retain Redis snapshots."
  type        = number
  default     = 7
}

variable "redis_maintenance_window" {
  description = "Preferred weekly maintenance window for Redis (UTC)."
  type        = string
  default     = "sun:17:00-sun:18:00"
}

variable "redis_auth_token" {
  description = "AUTH token for Redis replication group."
  type        = string
  sensitive   = true
}

variable "sandbox_enabled" {
  description = "Enable in-app Docker sandbox runtime. Requires ECS EC2 host-level Docker socket mount."
  type        = bool
  default     = true
}

variable "prewarm_sandbox_image" {
  description = "Default prewarm image pulled by sandbox runtime."
  type        = string
  default     = "node:20-slim"
}

variable "docker_registry_base" {
  description = "Registry base used for framework sandbox images."
  type        = string
  default     = "ghcr.io/pragnya-works/edward"
}

variable "deployment_type" {
  description = "Edward preview deployment type (path or subdomain)."
  type        = string
  default     = "path"

  validation {
    condition     = contains(["path", "subdomain"], var.deployment_type)
    error_message = "deployment_type must be either 'path' or 'subdomain'."
  }
}

variable "preview_root_domain" {
  description = "Preview root domain used only for subdomain deployment mode."
  type        = string
  default     = ""
}

variable "api_environment" {
  description = "Non-sensitive API env var overrides/additions."
  type        = map(string)
  default     = {}
}

variable "worker_environment" {
  description = "Worker-only non-sensitive env var overrides/additions."
  type        = map(string)
  default     = {}
}

variable "web_environment" {
  description = "Non-sensitive web env var overrides/additions."
  type        = map(string)
  default     = {}
}

variable "api_secrets" {
  description = "Sensitive API secrets map (NAME => valueFrom ARN for ECS secrets)."
  type        = map(string)
  default     = {}
}

variable "worker_secrets" {
  description = "Sensitive worker secrets map (NAME => valueFrom ARN for ECS secrets)."
  type        = map(string)
  default     = {}
}

variable "web_secrets" {
  description = "Sensitive web secrets map (NAME => valueFrom ARN for ECS secrets)."
  type        = map(string)
  default     = {}
}

variable "openai_model" {
  description = "Default OpenAI model name."
  type        = string
  default     = "gpt-5-nano-2025-08-07"
}

variable "gemini_model" {
  description = "Default Gemini model name."
  type        = string
  default     = "gemini-2.5-flash"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 14
}

variable "ecr_image_retention_count" {
  description = "Number of latest images to keep in ECR repositories."
  type        = number
  default     = 40
}

variable "allowed_cidr_ingress_web" {
  description = "CIDRs allowed to reach ALB listeners."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
