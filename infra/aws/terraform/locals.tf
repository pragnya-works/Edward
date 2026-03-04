locals {
  name_prefix = "${var.project_name}-${var.environment}"

  azs = slice(data.aws_availability_zones.available.names, 0, var.availability_zones_count)

  raw_api_path_prefix = (
    var.api_path_prefix == "" || var.api_path_prefix == "/"
    ? ""
    : (
      startswith(var.api_path_prefix, "/")
      ? trimsuffix(var.api_path_prefix, "/")
      : "/${trimsuffix(var.api_path_prefix, "/")}"
    )
  )

  app_domain = (
    var.domain_name != null && trim(var.domain_name, " ") != ""
    ? trim(var.domain_name, " ")
    : aws_lb.edge.dns_name
  )

  api_domain = (
    var.api_domain_name != null && trim(var.api_domain_name, " ") != ""
    ? trim(var.api_domain_name, " ")
    : local.app_domain
  )

  use_api_domain_routing = local.api_domain != local.app_domain

  normalized_api_path_prefix = (
    local.use_api_domain_routing
    ? local.raw_api_path_prefix
    : (
      local.raw_api_path_prefix == ""
      ? "/backend"
      : local.raw_api_path_prefix
    )
  )

  enable_api_path_routing = local.normalized_api_path_prefix != ""

  app_scheme = var.enable_https ? "https" : "http"
  app_url    = "${local.app_scheme}://${local.app_domain}"
  api_url    = "${local.app_scheme}://${local.api_domain}${local.normalized_api_path_prefix}"

  database_url = "postgresql://${urlencode(var.db_username)}:${urlencode(var.db_password)}@${aws_db_instance.postgres.address}:5432/${var.db_name}?sslmode=require"

  managed_cdn_bucket_name                  = try(aws_s3_bucket.cdn[0].id, "")
  managed_cdn_bucket_arn                   = try(aws_s3_bucket.cdn[0].arn, "")
  managed_cloudfront_distribution_id       = try(aws_cloudfront_distribution.cdn[0].id, "")
  managed_cloudfront_distribution_arn      = try(aws_cloudfront_distribution.cdn[0].arn, "")
  managed_cloudfront_distribution_domain   = try(aws_cloudfront_distribution.cdn[0].domain_name, "")
  external_cloudfront_distribution_url     = trimsuffix(trim(var.external_cloudfront_distribution_url, " "), "/")
  effective_cdn_bucket_name                = var.use_external_cdn ? trim(var.external_cdn_bucket_name, " ") : local.managed_cdn_bucket_name
  effective_cdn_bucket_arn                 = var.use_external_cdn ? "arn:aws:s3:::${local.effective_cdn_bucket_name}" : local.managed_cdn_bucket_arn
  effective_cloudfront_distribution_id     = var.use_external_cdn ? trim(var.external_cloudfront_distribution_id, " ") : local.managed_cloudfront_distribution_id
  effective_cloudfront_distribution_arn    = var.use_external_cdn ? trim(var.external_cloudfront_distribution_arn, " ") : local.managed_cloudfront_distribution_arn
  effective_cloudfront_distribution_url    = var.use_external_cdn ? local.external_cloudfront_distribution_url : "https://${local.managed_cloudfront_distribution_domain}"
  effective_cloudfront_distribution_domain = trimprefix(local.effective_cloudfront_distribution_url, "https://")
  effective_cloudfront_access_role_arn     = trim(var.external_cloudfront_role_arn, " ")

  api_generated_environment = {
    NODE_ENV                    = "production"
    API_URL                     = local.api_url
    API_BASE_PATH               = local.normalized_api_path_prefix
    EDWARD_API_PORT             = tostring(var.api_container_port)
    CORS_ORIGIN                 = local.app_url
    REDIS_HOST                  = aws_elasticache_replication_group.redis.primary_endpoint_address
    REDIS_PORT                  = tostring(aws_elasticache_replication_group.redis.port)
    REDIS_TLS                   = "true"
    TRUST_PROXY                 = "true"
    OPENAI_MODEL                = var.openai_model
    GEMINI_MODEL                = var.gemini_model
    AWS_REGION                  = data.aws_region.current.name
    AWS_BUCKET_NAME             = aws_s3_bucket.source.id
    AWS_CDN_BUCKET_NAME         = local.effective_cdn_bucket_name
    ASSETS_URL                  = local.effective_cloudfront_distribution_url
    CLOUDFRONT_DISTRIBUTION_URL = local.effective_cloudfront_distribution_url
    CLOUDFRONT_DISTRIBUTION_ID  = local.effective_cloudfront_distribution_id
    AWS_CLOUDFRONT_ROLE_ARN     = local.effective_cloudfront_access_role_arn
    SANDBOX_ENABLED             = var.sandbox_enabled ? "true" : "false"
    PREWARM_SANDBOX_IMAGE       = var.prewarm_sandbox_image
    DOCKER_REGISTRY_BASE        = var.docker_registry_base
    EDWARD_DEPLOYMENT_TYPE      = var.deployment_type
    PREVIEW_ROOT_DOMAIN         = var.preview_root_domain
  }

  api_override_environment = {
    for key, value in var.api_environment : key => value
    if key != "REDIS_PASSWORD"
  }

  api_environment = merge(local.api_generated_environment, local.api_override_environment)

  worker_base_environment = {
    for key, value in local.api_environment : key => value
    if key != "REDIS_PASSWORD"
  }

  worker_override_environment = {
    for key, value in var.worker_environment : key => value
    if key != "REDIS_PASSWORD"
  }

  worker_environment = merge(
    local.worker_base_environment,
    {
      NODE_ENV = "production"
    },
    local.worker_override_environment,
  )

  web_generated_environment = {
    NODE_ENV                    = "production"
    NEXT_PUBLIC_SITE_URL        = local.app_url
    NEXT_PUBLIC_API_URL         = local.api_url
    INTERNAL_API_URL            = local.api_url
    NEXT_PUBLIC_BETTER_AUTH_URL = local.app_url
    NEXT_PUBLIC_ASSETS_URL      = local.effective_cloudfront_distribution_url
  }

  web_environment = merge(local.web_generated_environment, var.web_environment)

  api_generated_secrets = {
    DATABASE_URL   = aws_secretsmanager_secret.database_url.arn
    REDIS_PASSWORD = aws_secretsmanager_secret.redis_auth_token.arn
  }

  web_generated_secrets = {
    DATABASE_URL = aws_secretsmanager_secret.database_url.arn
  }

  api_secrets    = merge(local.api_generated_secrets, var.api_secrets)
  worker_secrets = merge(local.api_secrets, var.worker_secrets)
  web_secrets    = merge(local.web_generated_secrets, var.web_secrets)

  api_environment_list = [
    for key, value in local.api_environment : {
      name  = key
      value = value
    }
  ]

  worker_environment_list = [
    for key, value in local.worker_environment : {
      name  = key
      value = value
    }
  ]

  web_environment_list = [
    for key, value in local.web_environment : {
      name  = key
      value = value
    }
  ]

  api_secrets_list = [
    for key, value in local.api_secrets : {
      name      = key
      valueFrom = value
    }
  ]

  worker_secrets_list = [
    for key, value in local.worker_secrets : {
      name      = key
      valueFrom = value
    }
  ]

  web_secrets_list = [
    for key, value in local.web_secrets : {
      name      = key
      valueFrom = value
    }
  ]

  app_secret_sources = toset(concat(
    [for _, value in local.api_secrets : value],
    [for _, value in local.worker_secrets : value],
    [for _, value in local.web_secrets : value],
  ))

  app_secret_arns = [
    for secret in local.app_secret_sources : regex("^arn:aws[^:]*:secretsmanager:[^:]+:[0-9]{12}:secret:[^:]+", secret)
    if can(regex("^arn:aws[^:]*:secretsmanager:[^:]+:[0-9]{12}:secret:[^:]+", secret))
  ]

  app_parameter_arns = [
    for secret in local.app_secret_sources : regex("^arn:aws[^:]*:ssm:[^:]+:[0-9]{12}:parameter/.+", secret)
    if can(regex("^arn:aws[^:]*:ssm:[^:]+:[0-9]{12}:parameter/.+", secret))
  ]
}
