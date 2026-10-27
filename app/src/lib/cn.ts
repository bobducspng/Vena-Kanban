import clsx, { type ClassValue } from "clsx";

/** Tiny class combiner. Keeps component class logic readable. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
