import { expect } from 'chai';
import Person from '../src/index.js';

describe("Person", () => {
  let person;

  before(() => {
    person = new Person('Cam', 99);
  });

  after(() => {
    person = undefined;
  });

  it("should return name", function() {
    expect(person.getName()).to.equal('Cam');
  });

  it("should return age", function() {
    expect(person.getAge()).to.equal(99);
  });
});
