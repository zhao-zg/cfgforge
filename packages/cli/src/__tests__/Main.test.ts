/**
 * T10.1 Main — CLI entry point tests.
 *
 * Tests parameter parsing, provider registration, tool/gen dispatch,
 * and error handling without actually running generators (mocked).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { run, runWithCatch, CliError, registerAllProviders } from '../Main';
import { Generators } from '@cfggen/gen';
import { Logger } from '@cfggen/shared';
import { Tools } from '../Tools';

describe('Main (CLI entry point)', () => {
  beforeEach(() => {
    // Reset Logger state
    Logger.setVerboseLevel(0);
    Logger.setWarningEnabled(true);
    Logger.setWeakWarningEnabled(false);
    // Clear any registered providers
    // We'll register fresh ones per test as needed
  });

  describe('run() with no args', () => {
    it('returns 0 when no args and no generators', async () => {
      const ret = await run([]);
      expect(ret).toBe(0);
    });
  });

  describe('run() with -h', () => {
    it('returns 0 for -h flag', async () => {
      const ret = await run(['-h']);
      expect(ret).toBe(0);
    });
  });

  describe('run() with unknown args', () => {
    it('returns 1 for unknown argument', async () => {
      const ret = await run(['-unknownarg']);
      expect(ret).toBe(1);
    });
  });

  describe('run() with missing value', () => {
    it('returns 1 (via CliError) when -datadir has no value', async () => {
      const ret = await runWithCatch(['-datadir']);
      expect(ret).toBe(1);
    });

    it('returns 1 (via CliError) when -gen has no value', async () => {
      const ret = await runWithCatch(['-gen']);
      expect(ret).toBe(1);
    });
  });

  describe('run() with -datadir required check', () => {
    it('returns 1 when -gen is used without -datadir', async () => {
      // Register a mock generator so -gen mockgen is "known"
      Generators.addProvider('mockgen', () => ({
        parameter: { get: () => '', has: () => false, getOrNull: () => null },
        generate: async () => {},
      }));

      const ret = await runWithCatch(['-gen', 'mockgen']);
      expect(ret).toBe(1); // help("-datadir is required")
    });
  });

  describe('run() with -gen unknown', () => {
    it('returns 1 when -gen name is unknown', async () => {
      const ret = await runWithCatch(['-datadir', '.', '-gen', 'nonexistentgen']);
      expect(ret).toBe(1);
    });
  });

  describe('run() with -tool unknown', () => {
    it('returns 1 when -tool name is unknown', async () => {
      const ret = await runWithCatch(['-tool', 'nonexistenttool']);
      expect(ret).toBe(1);
    });
  });

  describe('run() with -tool (no -datadir needed)', () => {
    it('returns 0 when only -tool is used (no -datadir)', async () => {
      let toolCalled = false;
      Tools.addProvider('mocktool', () => ({
        parameter: { get: () => '', has: () => false, getOrNull: () => null },
        call: async () => { toolCalled = true; },
      }));

      const ret = await run(['-tool', 'mocktool']);
      expect(ret).toBe(0);
      expect(toolCalled).toBe(true);
    });
  });

  describe('run() with i18n mutual exclusion', () => {
    it('returns 1 when both -i18nfile and -langswitchdir are set', async () => {
      Generators.addProvider('mockgen2', () => ({
        parameter: { get: () => '', has: () => false, getOrNull: () => null },
        generate: async () => {},
      }));

      const ret = await runWithCatch([
        '-datadir', '.',
        '-i18nfile', 'somefile.csv',
        '-langswitchdir', 'somedir',
        '-gen', 'mockgen2',
      ]);
      expect(ret).toBe(1); // help("-不能同时配置-i18nFile和-langSwitchDir")
    });
  });

  describe('run() with logging options', () => {
    it('sets verbose level 1 for -v', async () => {
      const ret = await run(['-v']);
      expect(ret).toBe(0);
      expect(Logger.verboseLevel()).toBe(1);
    });

    it('sets verbose level 2 for -vv', async () => {
      const ret = await run(['-vv']);
      expect(ret).toBe(0);
      expect(Logger.verboseLevel()).toBe(2);
    });

    it('disables warnings for -nowarn', async () => {
      const ret = await run(['-nowarn']);
      expect(ret).toBe(0);
      expect(Logger.isWarningEnabled()).toBe(false);
    });

    it('enables weak warnings for -weakwarn', async () => {
      const ret = await run(['-weakwarn']);
      expect(ret).toBe(0);
      expect(Logger.isWeakWarningEnabled()).toBe(true);
    });

    it('enables profile for -p', async () => {
      const ret = await run(['-p']);
      expect(ret).toBe(0);
      expect(Logger.isProfileEnabled()).toBe(true);
    });
  });

  describe('registerAllProviders()', () => {
    it('registers known generator providers', () => {
      // Clear existing providers by checking after registration
      // Note: registerAllProviders adds to the existing map
      registerAllProviders();

      const providers = Generators.getAllProviders();
      expect(providers.has('java')).toBe(true);
      expect(providers.has('cs')).toBe(true);
      expect(providers.has('bytes')).toBe(true);
      expect(providers.has('lua')).toBe(true);
      expect(providers.has('ts')).toBe(true);
      expect(providers.has('go')).toBe(true);
      expect(providers.has('gd')).toBe(true);
      expect(providers.has('tsschema')).toBe(true);
      expect(providers.has('json')).toBe(true);
      expect(providers.has('i18n')).toBe(true);
      expect(providers.has('i18nbyid')).toBe(true);
      expect(providers.has('byai')).toBe(true);
    });
  });
});
