---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'dabecaf2-6cfd-41f7-bacc-22671d87412d'
  PropagateID: 'dabecaf2-6cfd-41f7-bacc-22671d87412d'
  ReservedCode1: '6725fae2-a1b0-4127-b86d-607bae144c23'
  ReservedCode2: '6725fae2-a1b0-4127-b86d-607bae144c23'
---

# cfgeditor

## features

* view table schema, record
* edit record

### Prerequisites

1. nodejs, pnpm
2. `pnpm install`


## build

### development phase

```bash
pnpm run dev
```

then visit http://localhost:1420/.


### publish
```bash
pnpm run build
```

the target files is in `dist` directory. run frontend server:
```bash
cd dist
jwebserver
```
then visit http://localhost:8000/.


## build exe

### Prerequisites
1. rust

### generate cfgeditor.exe

```bash
pnpm tauri build
```

the generated cfgeditor.exe is in `src-tauri\target\release\` directory.

> AI生成