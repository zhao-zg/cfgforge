import { describe, it, expect } from 'vitest';
import { Primitive, FList, StructRef, FieldType } from '../FieldType';
import { AutoOrPack, Sep, Fix, Block, FieldFormat } from '../FieldFormat';
import { KeySchema } from '../KeySchema';
import { FieldSchema } from '../FieldSchema';
import { ForeignKeySchema } from '../ForeignKeySchema';
import { EntryType, ENo, EEntry, EEnum, isENo, isEEntry, isEEnum } from '../EntryType';
import { RefKey, RefPrimary, RefUniq, RefList, isRefPrimary, isRefUniq, isRefList } from '../RefKey';

// Use the stub Metadata for now
import { Metadata_of } from '../Metadata';

describe('EntryType', () => {
  describe('ENo', () => {
    it('is the singleton NO value', () => {
      expect(ENo.NO).toBeDefined();
    });

    it('isENo returns true', () => {
      expect(isENo(ENo.NO)).toBe(true);
      expect(isEEntry(ENo.NO)).toBe(false);
      expect(isEEnum(ENo.NO)).toBe(false);
    });

    it('copy() returns same singleton', () => {
      expect(ENo.NO.copy()).toBe(ENo.NO);
    });

    it('toString()', () => {
      expect(ENo.NO.toString()).toBe('ENo.NO');
    });
  });

  describe('EEntry', () => {
    it('creates with field name', () => {
      const e = new EEntry('id');
      expect(e.field).toBe('id');
      expect(e.fieldSchema).toBeNull();
    });

    it('isEEntry returns true', () => {
      expect(isEEntry(new EEntry('id'))).toBe(true);
      expect(isENo(new EEntry('id'))).toBe(false);
      expect(isEEnum(new EEntry('id'))).toBe(false);
    });

    it('copy() returns new EEntry with same field', () => {
      const e = new EEntry('id');
      const copy = e.copy();
      expect(copy).not.toBe(e);
      expect(copy.field).toBe('id');
      expect(copy.fieldSchema).toBeNull();
    });

    it('equals() compares by field name', () => {
      const e1 = new EEntry('id');
      const e2 = new EEntry('id');
      const e3 = new EEntry('name');
      expect(e1.equals(e2)).toBe(true);
      expect(e1.equals(e3)).toBe(false);
    });

    it('toString()', () => {
      expect(new EEntry('id').toString()).toBe("EEntry{field='id'}");
    });
  });

  describe('EEnum', () => {
    it('creates with field name', () => {
      const e = new EEnum('type');
      expect(e.field).toBe('type');
      expect(e.fieldSchema).toBeNull();
    });

    it('isEEnum returns true', () => {
      expect(isEEnum(new EEnum('type'))).toBe(true);
      expect(isENo(new EEnum('type'))).toBe(false);
      expect(isEEntry(new EEnum('type'))).toBe(false);
    });

    it('copy() returns new EEnum with same field', () => {
      const e = new EEnum('type');
      const copy = e.copy();
      expect(copy).not.toBe(e);
      expect(copy.field).toBe('type');
    });

    it('equals() compares by field name', () => {
      const e1 = new EEnum('type');
      const e2 = new EEnum('type');
      const e3 = new EEnum('category');
      expect(e1.equals(e2)).toBe(true);
      expect(e1.equals(e3)).toBe(false);
    });

    it('toString()', () => {
      expect(new EEnum('type').toString()).toBe("EEnum{field='type'}");
    });
  });
});

describe('RefKey', () => {
  describe('RefPrimary', () => {
    it('creates with nullable flag', () => {
      const rk = new RefPrimary(false);
      expect(rk.nullable).toBe(false);
      expect(rk.keyNames()).toEqual([]);
    });

    it('can be nullable', () => {
      const rk = new RefPrimary(true);
      expect(rk.nullable).toBe(true);
    });

    it('isRefPrimary returns true', () => {
      expect(isRefPrimary(new RefPrimary(false))).toBe(true);
      expect(isRefUniq(new RefPrimary(false))).toBe(false);
      expect(isRefList(new RefPrimary(false))).toBe(false);
    });

    it('copy() returns same value (immutable)', () => {
      const rk = new RefPrimary(true);
      const copy = rk.copy();
      expect(copy.nullable).toBe(true);
    });
  });

  describe('RefUniq', () => {
    it('creates with key and nullable flag', () => {
      const key = new KeySchema(['name']);
      const rk = new RefUniq(key, false);
      expect(rk.key).toBe(key);
      expect(rk.nullable).toBe(false);
      expect(rk.keyNames()).toEqual(['name']);
    });

    it('isRefUniq returns true', () => {
      expect(isRefUniq(new RefUniq(new KeySchema(['id']), true))).toBe(true);
      expect(isRefPrimary(new RefUniq(new KeySchema(['id']), true))).toBe(false);
    });

    it('copy() returns new RefUniq with copied key', () => {
      const key = new KeySchema(['name']);
      const rk = new RefUniq(key, true);
      const copy = rk.copy();
      expect(copy).not.toBe(rk);
      expect(copy.nullable).toBe(true);
      expect(copy.key.fields()).toEqual(['name']);
    });
  });

  describe('RefList', () => {
    it('creates with key', () => {
      const key = new KeySchema(['groupId']);
      const rk = new RefList(key);
      expect(rk.key).toBe(key);
      expect(rk.keyNames()).toEqual(['groupId']);
    });

    it('isRefList returns true', () => {
      expect(isRefList(new RefList(new KeySchema(['groupId'])))).toBe(true);
      expect(isRefPrimary(new RefList(new KeySchema(['groupId'])))).toBe(false);
    });

    it('copy() returns new RefList with copied key', () => {
      const key = new KeySchema(['groupId']);
      const rk = new RefList(key);
      const copy = rk.copy();
      expect(copy).not.toBe(rk);
      expect(copy.key.fields()).toEqual(['groupId']);
    });
  });
});

describe('KeySchema', () => {
  it('creates with field names', () => {
    const ks = new KeySchema(['id']);
    expect(ks.fields()).toEqual(['id']);
  });

  it('can have composite key', () => {
    const ks = new KeySchema(['serverId', 'playerId']);
    expect(ks.fields()).toEqual(['serverId', 'playerId']);
  });

  it('throws for empty key list', () => {
    expect(() => new KeySchema([])).toThrow();
  });

  it('copy() returns new KeySchema with same fields', () => {
    const ks = new KeySchema(['id', 'name']);
    const copy = ks.copy();
    expect(copy).not.toBe(ks);
    expect(copy.fields()).toEqual(['id', 'name']);
  });

  it('fieldSchemas starts null', () => {
    const ks = new KeySchema(['id']);
    expect(ks.fieldSchemas()).toBeNull();
  });

  it('setFieldSchemas sets fieldSchemas', () => {
    const ks = new KeySchema(['id']);
    const fs = new FieldSchema('id', Primitive.INT, AutoOrPack.AUTO, Metadata_of());
    ks.setFieldSchemas([fs]);
    expect(ks.fieldSchemas()).toEqual([fs]);
  });

  it('equals() compares by fields', () => {
    const ks1 = new KeySchema(['id']);
    const ks2 = new KeySchema(['id']);
    const ks3 = new KeySchema(['name']);
    expect(ks1.equals(ks2)).toBe(true);
    expect(ks1.equals(ks3)).toBe(false);
  });

  it('toString()', () => {
    const ks = new KeySchema(['id', 'name']);
    expect(ks.toString()).toBe('KeySchema{fields=[id, name]}');
  });
});

describe('FieldSchema', () => {
  it('creates with name, type, fmt, meta', () => {
    const meta = Metadata_of();
    const fs = new FieldSchema('id', Primitive.INT, AutoOrPack.AUTO, meta);
    expect(fs.name).toBe('id');
    expect(fs.type).toBe(Primitive.INT);
    expect(fs.fmt).toBe(AutoOrPack.AUTO);
    expect(fs.meta).toBe(meta);
  });

  it('throws for empty name', () => {
    expect(() => new FieldSchema('', Primitive.INT, AutoOrPack.AUTO, Metadata_of())).toThrow();
  });

  it('copy() returns deep copy', () => {
    const fs = new FieldSchema('id', Primitive.INT, AutoOrPack.AUTO, Metadata_of());
    const copy = fs.copy();
    expect(copy).not.toBe(fs);
    expect(copy.name).toBe('id');
    expect(copy.type).toBe(Primitive.INT);
  });

  it('copy() deep copies FList type', () => {
    const fs = new FieldSchema('items', new FList(Primitive.INT), AutoOrPack.PACK, Metadata_of());
    const copy = fs.copy();
    expect(copy.type).not.toBe(fs.type); // different FList instance
    expect((copy.type as FList).item).toBe(Primitive.INT);
  });
});

describe('ForeignKeySchema', () => {
  it('creates with name, key, refTable, refKey, meta', () => {
    const key = new KeySchema(['id']);
    const refKey = new RefPrimary(false);
    const meta = Metadata_of();
    const fk = new ForeignKeySchema('rewardId', key, 'RewardTable', refKey, meta);
    expect(fk.name).toBe('rewardId');
    expect(fk.key).toBe(key);
    expect(fk.refTable).toBe('RewardTable');
    expect(fk.refKey).toBe(refKey);
    expect(fk.meta).toBe(meta);
  });

  it('throws for empty name', () => {
    expect(() => new ForeignKeySchema('', new KeySchema(['id']), 'T', new RefPrimary(false), Metadata_of())).toThrow();
  });

  it('refTableSchema starts null', () => {
    const fk = new ForeignKeySchema('rid', new KeySchema(['id']), 'T', new RefPrimary(false), Metadata_of());
    expect(fk.refTableSchema()).toBeNull();
  });

  it('keyIndices starts null', () => {
    const fk = new ForeignKeySchema('rid', new KeySchema(['id']), 'T', new RefPrimary(false), Metadata_of());
    expect(fk.keyIndices()).toBeNull();
  });

  it('copy() returns deep copy', () => {
    const key = new KeySchema(['id']);
    const refKey = new RefPrimary(false);
    const fk = new ForeignKeySchema('rid', key, 'RefTable', refKey, Metadata_of());
    const copy = fk.copy();
    expect(copy).not.toBe(fk);
    expect(copy.name).toBe('rid');
    expect(copy.refTable).toBe('RefTable');
    expect(copy.key).not.toBe(key);
    expect(copy.key.fields()).toEqual(['id']);
  });

  it('toString() contains name and refTable', () => {
    const fk = new ForeignKeySchema('rid', new KeySchema(['id']), 'RefTable', new RefPrimary(false), Metadata_of());
    const s = fk.toString();
    expect(s).toContain('rid');
    expect(s).toContain('RefTable');
  });
});
