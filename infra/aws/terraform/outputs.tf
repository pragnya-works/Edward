output "alb_dns_name" {
  description = "Public DNS name of the edge ALB."
  value       = aws_lb.edge.dns_name
}

output "app_url" {
  description = "Application base URL."
  value       = local.app_url
}

output "api_url" {
  description = "Public API base URL (with configured path prefix)."
  value       = local.api_url
}

output "api_domain" {
  description = "API domain used for ingress."
  value       = local.api_domain
}

output "api_path_prefix" {
  description = "Effective API path prefix routed by ALB."
  value       = local.normalized_api_path_prefix
}

output "api_ecr_repository_url" {
  description = "ECR repository URI for API/worker images."
  value       = aws_ecr_repository.api.repository_url
}

output "web_ecr_repository_url" {
  description = "ECR repository URI for web images."
  value       = aws_ecr_repository.web.repository_url
}

output "source_bucket_name" {
  description = "S3 bucket for user/source artifacts."
  value       = aws_s3_bucket.source.id
}

output "cdn_bucket_name" {
  description = "S3 bucket for CDN artifacts."
  value       = local.effective_cdn_bucket_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution id for CDN invalidations."
  value       = local.effective_cloudfront_distribution_id
}

output "cloudfront_distribution_url" {
  description = "CloudFront distribution base URL used for CDN assets."
  value       = local.effective_cloudfront_distribution_url
}

output "cloudfront_distribution_domain_name" {
  description = "CloudFront distribution domain."
  value       = local.effective_cloudfront_distribution_domain
}

output "cdn_managed_by_terraform" {
  description = "Whether CDN S3+CloudFront resources are managed in this stack."
  value       = !var.use_external_cdn
}

output "postgres_endpoint" {
  description = "RDS endpoint hostname."
  value       = aws_db_instance.postgres.address
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint hostname."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_names" {
  description = "Created ECS services."
  value = {
    web    = aws_ecs_service.web.name
    api    = aws_ecs_service.api.name
    worker = aws_ecs_service.worker.name
  }
}
