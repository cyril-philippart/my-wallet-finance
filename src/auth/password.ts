import { hash, verify, type Options } from "@node-rs/argon2";

const options: Options = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, options);
}

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  return verify(hashValue, password, options);
}
