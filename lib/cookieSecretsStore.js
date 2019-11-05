'use strict'

module.exports = class CookieSecretsStore {
  constructor (initSecrets) {
    this.store = []
    if (Array.isArray(initSecrets)) {
      if (initSecrets.length === 0) {
        return new Error('The initial array of secrets must have at least 1 secret')
      }

      this.addSigning(initSecrets[0])
      const l = initSecrets.length
      for (let i = 1; i < l; ++i) {
        this.addUnsigning(initSecrets[i])
      }
    } else {
      this.addSigning(initSecrets)
    }
  }

  /**
   * Add a signing key to the store.
   *
   * @param key The key to add.
   *    This new key will sign new cookies,
   *    and be the first to be tried when unsigning.
   *    The previous signing key will be turned into the first unsigned key.
   *
   * @throws Error If the key is not a string or
   *    is a string shorter than 32 characters.
   */
  addSigning (key) {
    if (typeof key !== 'string' || key.length < 32) {
      throw new Error('The secret must be a string with length 32 or greater')
    }
    this.store.splice(0, 0, key)
  }

  /**
   * Add an unsigning key to the store.
   *
   * @param key Key to add.
   *     The added key becomes the new second key to check the signature with.
   *     Note that unlike signing key,
   *     unsigning keys are not checked, as requirements for them may change.
   */
  addUnsigning (key) {
    // Unsigning keys aren't required to match the normal requirements, in case requirements change.
    this.store.splice(1, 0, key)
  }

  /**
   * Checks if the given key exists in the store.
   * @param key The key to check.
   *
   * @returns {boolean} TRUE if the key is anywhere in the store, FALSE otherwise.
   */
  contains (key) {
    return this.store.lastIndexOf(key) !== -1
  }

  /**
   * Checks if the given key is for signing.
   *
   * @param key The key to check.
   *
   * @returns {boolean} TRUE if the key is the signing one, FALSE otherwise.
   */
  isSigning (key) {
    return this.store.indexOf(key) === 0
  }

  /**
   * Remove a key from the store.
   *
   * @param key {string} The key to remove.
   *     If it doesn't exist, no error is thrown.
   *
   * @throws Error If the key is the signing one.
   *     The signing key must be turned into unsigning one
   *     by adding a new signing key.
   */
  remove (key) {
    const index = this.store.lastIndexOf(key)
    if (index === 0) {
      throw new Error('Unable to remove the signing key. Add another one first')
    }
    if (index > 0) {
      this.store.splice(index, 1)
    }
  }
}
