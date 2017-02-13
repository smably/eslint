/**
 * @fileoverview Responsible for loading config files
 * @author Seth McLaughlin
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const path = require("path"),
    ConfigOps = require("./config/config-ops"),
    ConfigFile = require("./config/config-file"),
    configCache = require("./config/config-cache"),
    Plugins = require("./config/plugins"),
    FileFinder = require("./file-finder"),
    userHome = require("user-home"),
    isResolvable = require("is-resolvable"),
    pathIsInside = require("path-is-inside");

const debug = require("debug")("eslint:config");

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const PERSONAL_CONFIG_DIR = userHome || null;
const SUBCONFIG_SEP = ":";

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Determine if rules were explicitly passed in as options.
 * @param {Object} options The options used to create our configuration.
 * @returns {boolean} True if rules were passed in as options, false otherwise.
 * @private
 */
function hasRules(options) {
    return options.rules && Object.keys(options.rules).length > 0;
}

//------------------------------------------------------------------------------
// API
//------------------------------------------------------------------------------

/**
 * Configuration class
 */
class Config {

    /**
     * Config options
     * @param {Object} options Options to be passed in
     */
    constructor(options) {
        options = options || {};

        this.options = options;
        this.ignore = options.ignore;
        this.ignorePath = options.ignorePath;
        this.parser = options.parser;
        this.parserOptions = options.parserOptions || {};

        this.baseConfig = options.baseConfig
            ? ConfigOps.merge({}, ConfigFile.loadObject(options.baseConfig))
            : { rules: {} };
        this.baseConfig.filePath = "";
        this.baseConfig.baseDirectory = this.options.cwd;

        configCache.init();
        configCache.setConfig(this.baseConfig.filePath, this.baseConfig);
        configCache.setMergedVectorConfig(this.baseConfig.filePath, this.baseConfig);

        this.useEslintrc = (options.useEslintrc !== false);

        this.env = (options.envs || []).reduce((envs, name) => {
            envs[name] = true;
            return envs;
        }, {});

        /*
         * Handle declared globals.
         * For global variable foo, handle "foo:false" and "foo:true" to set
         * whether global is writable.
         * If user declares "foo", convert to "foo:false".
         */
        this.globals = (options.globals || []).reduce((globals, def) => {
            const parts = def.split(SUBCONFIG_SEP);

            globals[parts[0]] = (parts.length > 1 && parts[1] === "true");

            return globals;
        }, {});

        let useConfig = options.configFile;

        if (useConfig) {
            debug(`Using command line config ${useConfig}`);
            if (!(isResolvable(useConfig) || isResolvable(`eslint-config-${useConfig}`) || useConfig.charAt(0) === "@")) {
                useConfig = path.resolve(this.options.cwd, useConfig);
            }
            this.useSpecificConfig = ConfigFile.loadCached(useConfig);
        }

        if (this.options.plugins) {
            Plugins.loadAll(this.options.plugins);
        }

        // Empty values in configs don't merge properly
        const cliConfigOptions = {
            env: this.env,
            rules: this.options.rules,
            globals: this.globals,
            parserOptions: this.parserOptions,
            plugins: this.options.plugins
        };

        this.cliConfig = {};
        Object.keys(cliConfigOptions).forEach(function(configKey) {
            const value = cliConfigOptions[configKey];

            if (value) {
                this.cliConfig[configKey] = value;
            }
        }, this);
    }

    /**
     * Get personal config object from user's home directory
     * @returns {Object} the personal config object (null if there is no personal config)
     * @private
     */
    getPersonalConfig() {
        if (typeof this.personalConfig === "undefined") {
            let config;

            if (PERSONAL_CONFIG_DIR) {
                const filename = ConfigFile.getFilenameForDirectory(PERSONAL_CONFIG_DIR);

                if (filename) {
                    debug("Using personal config");
                    config = ConfigFile.loadCached(filename);
                }
            }
            this.personalConfig = config || null;
        }

        return this.personalConfig;
    }

    /**
     * Build a config hierarchy including the base config (conf/eslint.json), the
     * environments config (conf/environments.js) and eventually the user config.
     * @param {string} directory a file in whose directory we start looking for a local config
     * @returns {Object[]} The config objects
     * @private
     */
    getConfigHierarchy(directory) {
        let configs;

        debug(`Constructing config file hierarchy for ${directory}`);

        // Step 1: Always include baseConfig
        configs = [this.baseConfig];

        // Step 2: Add user-specified config from .eslintrc.* and package.json files
        if (this.useEslintrc) {
            debug("Using .eslintrc and package.json files");
            configs = configs.concat(this.getLocalConfigHierarchy(directory));
        } else {
            debug("Not using .eslintrc or package.json files");
        }

        // Step 3: Merge in command line config file
        if (this.useSpecificConfig) {
            debug("Using command line config file");
            configs.push(this.useSpecificConfig);
        }

        return configs;
    }

    /**
     * Get the local config hierarchy for a given directory.
     * @param {string} directory The directory to start looking in for a local config file.
     * @returns {Object[]} The shallow local config objects, or an empty array if there are no local config.
     * @private
     */
    getLocalConfigHierarchy(directory) {
        const localConfigFiles = this.findLocalConfigFiles(directory),
            projectConfigPath = ConfigFile.getFilenameForDirectory(this.options.cwd),
            searched = [],
            configs = [];
        let rootPath,
            cache;

        for (const localConfigFile of localConfigFiles) {
            const localConfigDirectory = path.dirname(localConfigFile);

            cache = configCache.getHierarchyLocalConfigs(localConfigDirectory);
            if (cache) {
                break;
            }

            // Don't consider the personal config file in the home directory,
            // except if the home directory is the same as the current working directory
            if (localConfigDirectory === PERSONAL_CONFIG_DIR && localConfigFile !== projectConfigPath) {
                continue;
            }

            // If root flag is set, don't consider file if it is above root
            if (rootPath && !pathIsInside(path.dirname(localConfigFile), rootPath)) {
                continue;
            }

            debug(`Loading ${localConfigFile}`);
            const localConfig = ConfigFile.loadCached(localConfigFile);

            // Ignore empty config files
            if (!localConfig) {
                continue;
            }

            // Check for root flag
            if (localConfig.root === true) {
                rootPath = path.dirname(localConfigFile);
            }

            debug(`Using ${localConfigFile}`);
            configs.push(localConfig);
            searched.push(localConfigDirectory);
        }

        if (!configs.length && !cache && !this.useSpecificConfig) {

            // Fall back on the personal config from ~/.eslintrc
            debug("Using personal config file");
            const personalConfig = this.getPersonalConfig();

            if (personalConfig) {
                configs.push(personalConfig);
            } else if (!hasRules(this.options) && !this.options.baseConfig) {

                // No config file, no manual configuration, and no rules, so error.
                const noConfigError = new Error("No ESLint configuration found.");

                noConfigError.messageTemplate = "no-config-found";
                noConfigError.messageData = {
                    directory,
                    filesExamined: localConfigFiles
                };

                throw noConfigError;
            }
        }

        // Merged with any cached portion
        configs.reverse();
        cache = cache ? cache.concat(configs) : configs;

        // Set the caches for the parent directories
        configCache.setHierarchyLocalConfigs(searched, cache);

        return cache;
    }

    /**
     * Get the vector of applicable configs from the hierarchy for a given file (glob matching occurs here).
     * @param {string} filePath The file path for which to build the hierarchy and config vector.
     * @returns {Array<number|string>} array of config file paths or nested override indices
     * @private
     */
    getConfigVector(filePath) {
        const directory = filePath ? path.dirname(filePath) : this.options.cwd,
            vector = [];

        this.getConfigHierarchy(directory).forEach(config => {
            const overrides = config.overrides;

            vector.push(config.filePath);

            if (!overrides) {
                return;
            }

            const relativePath = (filePath || directory).substr(config.baseDirectory.length + 1);

            overrides.forEach((override, i) => {
                if (ConfigOps.pathMatchesGlobs(relativePath, override.files)) {
                    vector.push(i);
                }
            });
        });

        return vector;
    }

    /**
     * Find local config files from directory and parent directories.
     * @param {string} directory The directory to start searching from.
     * @returns {string[]} The paths of local config files found.
     * @private
     */
    findLocalConfigFiles(directory) {
        if (!this.localConfigFinder) {
            this.localConfigFinder = new FileFinder(ConfigFile.CONFIG_FILES, this.options.cwd);
        }

        return this.localConfigFinder.findAllInDirectoryAndParents(directory);
    }

    /**
     * Build a config object merging the base config (conf/eslint.json), the
     * environments config (conf/environments.js) and eventually the user config.
     * @param {string} filePath a file in whose directory we start looking for a local config
     * @returns {Object} config object
     */
    getConfig(filePath) {
        const vector = this.getConfigVector(filePath);
        let config = configCache.getMergedConfig(vector);

        if (config) {
            debug("Using config from cache");
            return config;
        }

        // Step 1: Merge in the filesystem configurations (base, local, and personal)
        config = ConfigOps.getConfigFromVector(vector);

        // Step 2: Merge in command line configurations
        config = ConfigOps.merge(config, this.cliConfig);

        // Step 3: Override parser only if it is passed explicitly through the command line
        // or if it's not defined yet (because the final object will at least have the parser key)
        if (this.parser || !config.parser) {
            config = ConfigOps.merge(config, {
                parser: this.parser
            });
        }

        // Step 4: Apply environments to the config if present
        if (config.env) {
            config = ConfigOps.applyEnvironments(config);
        }

        configCache.setMergedConfig(vector, config);

        return config;
    }
}

module.exports = Config;
