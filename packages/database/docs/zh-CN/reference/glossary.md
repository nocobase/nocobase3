# 术语表

| 术语 | 中文说明 |
| --- | --- |
| Collection | 应用层数据模型抽象，可以映射到表、视图或物化视图。 |
| Collection DSL | 描述 Collection 的结构化定义语言。 |
| Collection Builder | 执行 Collection 创建和变更的核心 API。 |
| Collection Generator | 从已有数据库元数据生成 Collection 的目标组件，当前未实现。 |
| CollectionOperation | Builder 的结构化执行计划。 |
| Field | Collection 的应用层字段。 |
| Column | 数据库物理列。 |
| `field.name` | 应用层字段名。 |
| `field.columnName` | 数据库物理列名覆盖。 |
| `collection.name` | 应用层 Collection 名称。 |
| `collection.tableName` | 数据库物理表名或视图名覆盖。 |
| `naming.underscored` | 控制推导出的物理名是否转为小写下划线。 |
| `naming.tablePrefix` | 推导表名或视图名时添加的前缀，不作用于列名。 |
| 逻辑名 | 应用层名称，例如 Collection 名和 Field 名。 |
| 物理名 | 数据库对象名称，例如 table、view、column 名。 |
| Metadata | 应用层元信息，例如 title、description、interface、uiSchema。 |
| `db.comment` | 数据库层 comment，不等同于应用层 description。 |
| Constraint | 数据完整性约束，例如 primary、unique、foreign key。 |
| Index | 查询性能索引。 |
| SchemaAdapter | Builder 和底层数据库 schema builder 之间的适配接口。 |
| KnexSchemaAdapter | 当前基于 Knex 的 SchemaAdapter 实现。 |
| DatabaseManager | 管理默认连接和命名连接的入口。 |
| DatabaseConnection | 一个具体数据库连接。 |
| QueryAdapter | 当前的基础查询适配器，不是 Repository。 |
| Repository | 计划中的常规数据访问封装，当前未实现。 |
| Model | 计划中的模型封装，当前未实现。 |
| Transformer | 计划中的数据转换层，当前未实现。 |

## 命名规则

文档文件名、API 名、类型名保持英文。中文文档中的概念解释可以使用中文，但不要翻译 API 名称。

例如：

- 使用 `createCollection`，不要写成“创建集合方法”。
- 使用 `CollectionOperation`，不要写成“集合操作”。
- 使用 `SchemaAdapter`，不要写成“结构适配器”。

## Agent 注意事项

Agent 生成代码或解释 API 时，应优先使用英文 API 名和类型名，中文只用于解释含义。

涉及命名映射时，应明确区分逻辑名和物理名。
