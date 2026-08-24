/**
 * interfaces — re-exports for circular dependency resolution.
 *
 * StructSchema references InterfaceSchema (for nullableInterface),
 * and InterfaceSchema references StructSchema (for impls).
 * This file provides a single import point for Fieldable and Structural.
 */

export { Fieldable } from './Fieldable';
export { Structural } from './Structural';
