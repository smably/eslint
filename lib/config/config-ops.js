/**
 * @fileoverview Config file operations. This file must be usable in the browser,
 * so no Node-specific code can be here.
 * @author Nicholas C. Zakas
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const Environments = require("./environments"),
    configCache = require("./config-cache"),
    minimatch = require("minimatch");

const debug = require("debug")("eslint:config-ops");

//------------------------------------------------------------------------------
// Private
//------------------------------------------------------------------------------

const RULE_SEVERITY_STRINGS = ["off", "warn", "error"],
    RULE_SEVERITY = RULE_SEVERITY_STRINGS.reduce((map, value, index) => {
        map[value] = index;
        return map;
    }, {}),
    VALID_SEVERITIES = [0, 1, 2, "off", "warn", "error"];

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

module.exports = {

    /**
     * Creates an empty configuration object suitable for merging as a base.
     * @returns {Object} A configuration object.
     */
    createEmptyConfig() {
        return {
            globals: {},
            env: {},
            rules: {},
            parserOptions: {}
        };
    },

    /**
     * Creates an environment config based on the specified environments.
     * @param {Object<string,boolean>} env The environment settings.
     * @returns {Object} A configuration object with the appropriate rules and globals
     *      set.
     */
    createEnvironmentConfig(env) {

        const envConfig = this.createEmptyConfig();

        if (env) {

            envConfig.env = env;

            Object.keys(env).filter(name => env[name]).forEach(name => {
                const environment = Environments.get(name);

                if (environment) {
                    debug(`Creating config for environment ${name}`);
                    if (environment.globals) {
                        Object.assign(envConfig.globals, environment.globals);
                    }

                    if (environment.parserOptions) {
                        Object.assign(envConfig.parserOptions, environment.parserOptions);
                    }
                }
            });
        }

        return envConfig;
    },

    /**
     * Given a config with environment settings, applies the globals and
     * ecmaFeatures to the configuration and returns the result.
     * @param {Object} config The configuration information.
     * @returns {Object} The updated configuration information.
     */
    applyEnvironments(config) {
        if (config.env && typeof config.env === "object") {
            debug("Apply environment settings to config");
            return this.merge(this.createEnvironmentConfig(config.env), config);
        }

        return config;
    },

    /**
     * Merges two config objects. This will not only add missing keys, but will also modify values to match.
     * @param {Object} target config object
     * @param {Object} src config object. Overrides in this config object will take priority over base.
     * @param {boolean} [combine] Whether to combine arrays or not
     * @param {boolean} [isRule] Whether its a rule
     * @returns {Object} merged config object.
     */
    merge: function deepmerge(target, src, combine, isRule) {

        /*
         The MIT License (MIT)

         Copyright (c) 2012 Nicholas Fisher

         Permission is hereby granted, free of charge, to any person obtaining a copy
         of this software and associated documentation files (the "Software"), to deal
         in the Software without restriction, including without limitation the rights
         to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
         copies of the Software, and to permit persons to whom the Software is
         furnished to do so, subject to the following conditions:

         The above copyright notice and this permission notice shall be included in
         all copies or substantial portions of the Software.

         THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
         IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
         FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
         AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
         LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
         OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
         THE SOFTWARE.
         */

        /*
         * This code is taken from deepmerge repo
         * (https://github.com/KyleAMathews/deepmerge)
         * and modified to meet our needs.
         */
        const array = Array.isArray(src) || Array.isArray(target);
        let dst = array && [] || {};

        combine = !!combine;
        isRule = !!isRule;
        if (array) {
            target = target || [];

            // src could be a string, so check for array
            if (isRule && Array.isArray(src) && src.length > 1) {
                dst = dst.concat(src);
            } else {
                dst = dst.concat(target);
            }
            if (typeof src !== "object" && !Array.isArray(src)) {
                src = [src];
            }
            Object.keys(src).forEach((e, i) => {
                e = src[i];
                if (typeof dst[i] === "undefined") {
                    dst[i] = e;
                } else if (typeof e === "object") {
                    if (isRule) {
                        dst[i] = e;
                    } else {
                        dst[i] = deepmerge(target[i], e, combine, isRule);
                    }
                } else {
                    if (!combine) {
                        dst[i] = e;
                    } else {
                        if (dst.indexOf(e) === -1) {
                            dst.push(e);
                        }
                    }
                }
            });
        } else {
            if (target && typeof target === "object") {
                Object.keys(target).forEach(key => {
                    dst[key] = target[key];
                });
            }
            Object.keys(src).forEach(key => {
                if (key === "overrides") {
                    dst[key] = (target[key] || []).concat(src[key] || []);
                } else if (Array.isArray(src[key]) || Array.isArray(target[key])) {
                    dst[key] = deepmerge(target[key], src[key], key === "plugins", isRule);
                } else if (typeof src[key] !== "object" || !src[key] || key === "exported" || key === "astGlobals") {
                    dst[key] = src[key];
                } else {
                    dst[key] = deepmerge(target[key] || {}, src[key], combine, key === "rules");
                }
            });
        }

        return dst;
    },

    /**
     * Converts new-style severity settings (off, warn, error) into old-style
     * severity settings (0, 1, 2) for all rules. Assumption is that severity
     * values have already been validated as correct.
     * @param {Object} config The config object to normalize.
     * @returns {void}
     */
    normalize(config) {

        if (config.rules) {
            Object.keys(config.rules).forEach(ruleId => {
                const ruleConfig = config.rules[ruleId];

                if (typeof ruleConfig === "string") {
                    config.rules[ruleId] = RULE_SEVERITY[ruleConfig.toLowerCase()] || 0;
                } else if (Array.isArray(ruleConfig) && typeof ruleConfig[0] === "string") {
                    ruleConfig[0] = RULE_SEVERITY[ruleConfig[0].toLowerCase()] || 0;
                }
            });
        }
    },

    /**
     * Converts old-style severity settings (0, 1, 2) into new-style
     * severity settings (off, warn, error) for all rules. Assumption is that severity
     * values have already been validated as correct.
     * @param {Object} config The config object to normalize.
     * @returns {void}
     */
    normalizeToStrings(config) {

        if (config.rules) {
            Object.keys(config.rules).forEach(ruleId => {
                const ruleConfig = config.rules[ruleId];

                if (typeof ruleConfig === "number") {
                    config.rules[ruleId] = RULE_SEVERITY_STRINGS[ruleConfig] || RULE_SEVERITY_STRINGS[0];
                } else if (Array.isArray(ruleConfig) && typeof ruleConfig[0] === "number") {
                    ruleConfig[0] = RULE_SEVERITY_STRINGS[ruleConfig[0]] || RULE_SEVERITY_STRINGS[0];
                }
            });
        }
    },

    /**
     * Determines if the severity for the given rule configuration represents an error.
     * @param {int|string|Array} ruleConfig The configuration for an individual rule.
     * @returns {boolean} True if the rule represents an error, false if not.
     */
    isErrorSeverity(ruleConfig) {

        let severity = Array.isArray(ruleConfig) ? ruleConfig[0] : ruleConfig;

        if (typeof severity === "string") {
            severity = RULE_SEVERITY[severity.toLowerCase()] || 0;
        }

        return (typeof severity === "number" && severity === 2);
    },

    /**
     * Checks whether a given config has valid severity or not.
     * @param {number|string|Array} ruleConfig - The configuration for an individual rule.
     * @returns {boolean} `true` if the configuration has valid severity.
     */
    isValidSeverity(ruleConfig) {
        let severity = Array.isArray(ruleConfig) ? ruleConfig[0] : ruleConfig;

        if (typeof severity === "string") {
            severity = severity.toLowerCase();
        }
        return VALID_SEVERITIES.indexOf(severity) !== -1;
    },

    /**
     * Checks whether every rule of a given config has valid severity or not.
     * @param {Object} config - The configuration for rules.
     * @returns {boolean} `true` if the configuration has valid severity.
     */
    isEverySeverityValid(config) {
        return Object.keys(config).every(ruleId => this.isValidSeverity(config[ruleId]));
    },

    /**
     * Merges all configurations for a given config vector
     * @param {Array<number|string>} vector array of config file paths or relative override indices
     * @returns {Object} config object
     */
    getConfigFromVector(vector) {

        const subvector = Array.from(vector);
        let config,
            subConfigs,
            nearestCacheIndex = vector.length - 1;

        // Check the merged vector config cache to try to find a merged config for the current config or a parent
        for (; nearestCacheIndex >= 0; nearestCacheIndex--) {
            config = configCache.getMergedVectorConfig(subvector);
            if (config) {
                break;
            }
            subvector.pop();
        }

        if (config) {
            if (nearestCacheIndex === vector.length - 1) {
                return config;
            }
            debug("Using config from partial cache");

            // Get parent config if configKey is an override index
            if (typeof vector[nearestCacheIndex + 1] === "number") {

                // If the first non-cached vector is an override index, subConfigs needs to be set
                let parentConfigKey = vector[nearestCacheIndex];

                for (let i = nearestCacheIndex - 1; i >= 0 && typeof parentConfigKey !== "string"; i--) {
                    parentConfigKey = vector[i];
                }
                subConfigs = configCache.getConfig(parentConfigKey).overrides;
            }
        } else {
            config = {};
        }

        // Start from index of nearest cached config
        for (let i = nearestCacheIndex + 1; i < vector.length; i++) {
            const configKey = vector[i];
            let shallowConfig;

            if (typeof configKey === "string") {
                shallowConfig = configCache.getConfig(configKey);
                subConfigs = shallowConfig.overrides;
            } else {
                shallowConfig = subConfigs[configKey];
            }
            config = this.merge(config, shallowConfig);
            if (config.filePath) {
                delete config.filePath;
                delete config.baseDirectory;
            } else if (config.files) {
                delete config.files;
            }
            configCache.setMergedVectorConfig(vector, config);
        }

        return config;
    },

    /**
     * Checks that the specified file path matches all of the supplied glob patterns
     * @param {string} filePath The file path to test patterns against
     * @param {string|string[]} patterns One or more glob patterns, all of which will be matched against the file path
     * @returns {boolean} True if all the supplied patterns match the file path, false otherwise
     */
    pathMatchesGlobs(filePath, patterns) {
        patterns = [].concat(patterns);
        return patterns.every(pattern => minimatch(filePath, pattern, { matchBase: true }));
    }
};
