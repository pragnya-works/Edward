check "external_cdn_configuration" {
  assert {
    condition = (
      !var.use_external_cdn || (
        trim(var.external_cdn_bucket_name, " ") != "" &&
        trim(var.external_cloudfront_distribution_id, " ") != "" &&
        trim(var.external_cloudfront_distribution_url, " ") != "" &&
        trim(var.external_cloudfront_distribution_arn, " ") != "" &&
        trim(var.external_cloudfront_role_arn, " ") != ""
      )
    )
    error_message = "use_external_cdn=true requires external_cdn_bucket_name, external_cloudfront_distribution_id, external_cloudfront_distribution_url, external_cloudfront_distribution_arn, and external_cloudfront_role_arn."
  }

  assert {
    condition = (
      !var.use_external_cdn ||
      endswith(
        trim(var.external_cloudfront_distribution_arn, " "),
        "/${trim(var.external_cloudfront_distribution_id, " ")}",
      )
    )
    error_message = "external_cloudfront_distribution_arn must match external_cloudfront_distribution_id."
  }
}

check "network_configuration" {
  assert {
    condition     = length(var.public_subnet_cidrs) == var.availability_zones_count
    error_message = "public_subnet_cidrs length must equal availability_zones_count."
  }

  assert {
    condition     = length(var.private_subnet_cidrs) == var.availability_zones_count
    error_message = "private_subnet_cidrs length must equal availability_zones_count."
  }

  assert {
    condition = (
      var.asg_min_size <= var.asg_desired_size &&
      var.asg_desired_size <= var.asg_max_size
    )
    error_message = "asg_min_size must be <= asg_desired_size <= asg_max_size."
  }
}

check "https_configuration" {
  assert {
    condition = (
      !var.enable_https ||
      trim(coalesce(var.certificate_arn, ""), " ") != ""
    )
    error_message = "certificate_arn must be set when enable_https=true."
  }
}

check "managed_cdn_waf_configuration" {
  assert {
    condition = (
      var.use_external_cdn ||
      trim(var.cloudfront_web_acl_arn, " ") != ""
    )
    error_message = "cloudfront_web_acl_arn must be provided when use_external_cdn=false."
  }
}

check "rolling_deploy_capacity" {
  assert {
    condition = (
      (
        var.api_deployment_min_healthy_percent == 0 &&
        var.web_deployment_min_healthy_percent == 0
      ) ||
      var.asg_desired_size >= 2
    )
    error_message = "asg_desired_size must be at least 2 when api/web minimum healthy percent is greater than 0."
  }
}
