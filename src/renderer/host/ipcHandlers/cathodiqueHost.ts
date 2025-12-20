import { Module } from "../classes/module.js";

export class CathodiqueHostHandler {
  mod: Module;

  constructor (mod: Module) {
    this.mod = mod;
  }

  async getDependency({ data }: { data: { dependency: string } }) {

  }
  async getOptionalDependency({ data }: { data: { dependency: string } }) {

  }
  async getAllDependency({ data }: { data: { dependency: string } }) {

  }
};
