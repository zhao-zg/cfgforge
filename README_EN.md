---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '24ec0ffb-6efb-4ceb-8653-0020c813c233'
  PropagateID: '24ec0ffb-6efb-4ceb-8653-0020c813c233'
  ReservedCode1: '77919b75-c5b3-489f-a816-1515225f6c8b'
  ReservedCode2: '77919b75-c5b3-489f-a816-1515225f6c8b'
---

# Configuration Table Generation System

![intro](docs/src/content/docs/intro.png)

An object database browser, editor, and program access code generator

1. Define object structure
2. Use Excel to edit, or use node-based interface to edit and browse all objects
3. Generate access code

## Main Features

* Support for polymorphic and nested structures
* Configure foreign keys, and detect data consistency
* Generate typed data access code, foreign key references, entries, and enums (eliminating magic numbers in programs)
* Support for Java, C#, Lua, Go, TypeScript
* Structure data can be configured in Excel or JSON, providing node-based interface for editing and browsing
* Java generation focuses on hot update safety, Lua generation focuses on memory size

## Documentation

Please read the [detailed documentation](https://stallboy.github.io/cfgforge)

## Quick Start

### Configuration System cfgforge

Please refer to [Configuration System Documentation](packages/cli/README.md).

### Editor cfgeditor.exe

Please refer to [Editor cfgeditor Documentation](cfgeditor/README.md)

### VSCode Extension: cfg-support

We provide a specialized VSCode extension for `.cfg` configuration files with the following features:

- **Syntax Highlighting**: Structure definitions, type identifiers, foreign key references, etc.
- **Go to Definition**: Ctrl+click on type names or foreign key references to jump to definition locations

For detailed features and usage instructions, please refer to [VSCode CFG Extension Documentation](cfgdev/vscode-cfg-extension/README.md).

> AI生成