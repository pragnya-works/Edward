resource "aws_db_subnet_group" "postgres" {
  name       = "${local.name_prefix}-postgres-subnet"
  subnet_ids = [for subnet in aws_subnet.private : subnet.id]

  tags = {
    Name = "${local.name_prefix}-postgres-subnet"
  }
}

resource "aws_db_instance" "postgres" {
  identifier                   = "${local.name_prefix}-postgres"
  engine                       = "postgres"
  engine_version               = "16.4"
  instance_class               = var.db_instance_class
  allocated_storage            = var.db_allocated_storage
  max_allocated_storage        = var.db_max_allocated_storage
  db_name                      = var.db_name
  username                     = var.db_username
  password                     = var.db_password
  db_subnet_group_name         = aws_db_subnet_group.postgres.name
  vpc_security_group_ids       = [aws_security_group.postgres.id]
  publicly_accessible          = false
  storage_encrypted            = true
  backup_retention_period      = var.db_backup_retention_days
  skip_final_snapshot          = !var.db_deletion_protection
  final_snapshot_identifier    = "${local.name_prefix}-postgres-final"
  deletion_protection          = var.db_deletion_protection
  auto_minor_version_upgrade   = true
  apply_immediately            = true
  performance_insights_enabled = false

  tags = {
    Name = "${local.name_prefix}-postgres"
  }
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name_prefix}-redis-subnet"
  subnet_ids = [for subnet in aws_subnet.private : subnet.id]
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${local.name_prefix}-redis"
  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]
  parameter_group_name = "default.redis7"
  apply_immediately    = true

  tags = {
    Name = "${local.name_prefix}-redis"
  }
}
