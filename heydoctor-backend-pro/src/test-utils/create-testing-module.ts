import type { Provider, Type } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

/** Evita que un Proxy sea interpretado como promesa durante resoluciones async. */
function isPromiseLikeProp(prop: string | symbol): boolean {
  return prop === 'then' || prop === 'catch' || prop === 'finally';
}

/**
 * Mock laxo por defecto para dependencias Nest: cualquier método devuelve jest.fn().
 * Para asserts concretos, usa `{ provide: Token, useValue: ...}` en el array.
 */
export function nestAutoMock(): Record<PropertyKey, unknown> {
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (isPromiseLikeProp(prop)) return undefined;
        return jest.fn();
      },
    },
  );
}

function isCustomProvider(p: unknown): p is Provider {
  return typeof p === 'object' && p !== null && 'provide' in p;
}

function isClassToken(p: unknown): p is Type<unknown> {
  return typeof p === 'function';
}

export type TestingModuleProviderEntry = Provider | Type<unknown>;

export interface CreateTestingModuleWithMocksOptions {
  providers: TestingModuleProviderEntry[];
  /**
   * Clases que Nest debe instanciar de verdad (normalmente el SUT).
   * Cualquier otra clase en `providers` se registra como `useValue: nestAutoMock()`.
   */
  subjects?: Type<unknown>[];
}

/**
 * {@link Test.createTestingModule} con auto-mock de clases sueltas para no romper
 * el árbol DI cuando se añaden dependencias nuevas al constructor.
 */
export async function createTestingModuleWithMocks({
  providers,
  subjects = [],
}: CreateTestingModuleWithMocksOptions): Promise<TestingModule> {
  const subjectSet = new Set(subjects);
  const mapped: Provider[] = providers.map((p) => {
    if (isCustomProvider(p)) return p;
    if (isClassToken(p)) {
      if (subjectSet.has(p)) return p;
      return { provide: p, useValue: nestAutoMock() };
    }
    return p as Provider;
  });

  return Test.createTestingModule({
    providers: mapped,
  }).compile();
}
