resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "source" {
  bucket = lower("${local.name_prefix}-${random_id.bucket_suffix.hex}-source")
}

resource "aws_s3_bucket_versioning" "source" {
  bucket = aws_s3_bucket.source.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "source" {
  bucket = aws_s3_bucket.source.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "source" {
  bucket = aws_s3_bucket.source.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "cdn" {
  count = var.use_external_cdn ? 0 : 1

  bucket = lower("${local.name_prefix}-${random_id.bucket_suffix.hex}-cdn")
}

resource "aws_s3_bucket_versioning" "cdn" {
  count = var.use_external_cdn ? 0 : 1

  bucket = aws_s3_bucket.cdn[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cdn" {
  count = var.use_external_cdn ? 0 : 1

  bucket = aws_s3_bucket.cdn[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cdn" {
  count = var.use_external_cdn ? 0 : 1

  bucket = aws_s3_bucket.cdn[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "cdn" {
  count = var.use_external_cdn ? 0 : 1

  name                              = "${local.name_prefix}-cdn-oac"
  description                       = "OAC for Edward CDN bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "cdn" {
  count = var.use_external_cdn ? 0 : 1

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.cdn[0].bucket_regional_domain_name
    origin_id                = "cdn-s3-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.cdn[0].id
  }

  default_cache_behavior {
    target_origin_id       = "cdn-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 31536000
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "cdn" {
  count = var.use_external_cdn ? 0 : 1

  bucket = aws_s3_bucket.cdn[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontRead"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.cdn[0].arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.cdn[0].arn
          }
        }
      }
    ]
  })
}
