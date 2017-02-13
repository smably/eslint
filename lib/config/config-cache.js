/**
 * @fileoverview Responsible for caching config files
 * @author Sylvan Mably
 */

"use strict";

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const VECTOR_SEP = ",";

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Get a string hash for a vector object
 * @param {Array<number|string>} vector config vector to hash
 * @returns {string} hash of the vector values
 * @private
 */
function hash(vector) {
    return vector ? vector.join(VECTOR_SEP) : "";
}

//------------------------------------------------------------------------------
// API
//------------------------------------------------------------------------------

/**
 * Configuration caching class (not exported)
 */
class ConfigCache {

    constructor() {
        this.init();
    }

    init() {
        this.filePathCache = new Map();
        this.localHierarchyCache = new Map();
        this.mergedVectorCache = new Map();
        this.mergedCache = new Map();
    }

    getConfig(filePath) {
        return this.filePathCache.get(filePath);
    }

    setConfig(filePath, config) {
        this.filePathCache.set(filePath, config);
    }

    getHierarchyLocalConfigs(directory) {
        return this.localHierarchyCache.get(directory);
    }

    setHierarchyLocalConfigs(parentDirectories, parentConfigs) {
        parentDirectories.forEach((localConfigDirectory, i) => {
            const directoryParentConfigs = parentConfigs.slice(0, parentConfigs.length - i);

            this.localHierarchyCache.set(localConfigDirectory, directoryParentConfigs);
        });
    }

    getMergedVectorConfig(vector) {
        return this.mergedVectorCache.get(hash(vector));
    }

    setMergedVectorConfig(vector, config) {
        this.mergedVectorCache.set(hash(vector), config);
    }

    getMergedConfig(vector) {
        return this.mergedCache.get(hash(vector));
    }

    setMergedConfig(vector, config) {
        this.mergedCache.set(hash(vector), config);
    }
}

const configCache = new ConfigCache();

module.exports = configCache;
