# task: generate Postgres DDL based on the spec in docs/program-db-spec.md
# output: valid SQL create table statements
# target engine: Postgres
# include indexes and constraints
# no sample data, only schema DDL
# follow the tables & field types defined in docs/program-db-spec.md exactly

Use the docs/program-db-spec.md in this repo as the authoritative guide.