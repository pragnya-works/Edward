resource "aws_db_subnet_group" "postgres" {
  name       = "${local.name_prefix}-postgres-subnet"
  subnet_ids = [for subnet in aws_subnet.private : subnet.id]

  tags = {
    Name = "${local.name_prefix}-postgres-subnet"
  }
}

resource "aws_db_instance" "postgres" {
  identifier                            = "${local.name_prefix}-postgres"
  engine                                = "postgres"
  engine_version                        = "16.4"
  instance_class                        = var.db_instance_class
  allocated_storage                     = var.db_allocated_storage
  max_allocated_storage                 = var.db_max_allocated_storage
  db_name                               = var.db_name
  username                              = var.db_username
  password                              = var.db_password
  db_subnet_group_name                  = aws_db_subnet_group.postgres.name
  vpc_security_group_ids                = [aws_security_group.postgres.id]
  publicly_accessible                   = false
  storage_encrypted                     = true
  backup_retention_period               = var.db_backup_retention_days
  skip_final_snapshot                   = !var.db_deletion_protection
  final_snapshot_identifier             = "${local.name_prefix}-postgres-final"
  deletion_protection                   = var.db_deletion_protection
  auto_minor_version_upgrade            = true
  apply_immediately                     = false
  maintenance_window                    = var.db_maintenance_window
  performance_insights_enabled          = var.environment == "prod"
  performance_insights_retention_period = var.environment == "prod" ? 7 : null

  tags = {
    Name = "${local.name_prefix}-postgres"
  }
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name_prefix}-redis-subnet"
  subnet_ids = [for subnet in aws_subnet.private : subnet.id]
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${local.name_prefix}-redis"
  description                = "Edward Redis replication group"
  engine                     = "redis"
  engine_version             = var.redis_engine_version
  node_type                  = var.redis_node_type
  num_cache_clusters         = var.redis_num_cache_clusters
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]
  parameter_group_name       = "default.redis7"
  automatic_failover_enabled = true
  multi_az_enabled           = true
  apply_immediately          = false
  maintenance_window         = var.redis_maintenance_window
  snapshot_retention_limit   = var.redis_snapshot_retention_limit
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  auth_token                 = var.redis_auth_token
  auto_minor_version_upgrade = true

  tags = {
    Name = "${local.name_prefix}-redis"
  }
}

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name_prefix}/database-url"
  description             = "Database URL for Edward ECS services"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = local.database_url
}

resource "aws_secretsmanager_secret" "redis_auth_token" {
  name                    = "${local.name_prefix}/redis-auth-token"
  description             = "Redis auth token for Edward ECS services"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "redis_auth_token" {
  secret_id     = aws_secretsmanager_secret.redis_auth_token.id
  secret_string = var.redis_auth_token
}
