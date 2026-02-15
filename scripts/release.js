const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Configuration
const COMMON_JS_PATH = path.join(__dirname, '../pwa/common.js');
const SW_JS_PATH = path.join(__dirname, '../pwa/sw.js');

function incrementVersion(version) {
    const parts = version.match(/v(\d+)\.(\d+)\.(\d+)/);
    if (!parts) return version;
    let [_, major, minor, patch] = parts;
    patch = parseInt(patch) + 1;
    return `v${major}.${minor}.${patch}`;
}

function updateCommonJs() {
    let content = fs.readFileSync(COMMON_JS_PATH, 'utf8');
    const versionMatch = content.match(/const APP_VERSION = '(v\d+\.\d+\.\d+)';/);

    if (!versionMatch) {
        console.error('Could not find APP_VERSION in common.js');
        process.exit(1);
    }

    const currentVersion = versionMatch[1];
    const newVersion = incrementVersion(currentVersion);

    content = content.replace(
        `const APP_VERSION = '${currentVersion}';`,
        `const APP_VERSION = '${newVersion}';`
    );

    fs.writeFileSync(COMMON_JS_PATH, content);
    console.log(`Updated common.js: ${currentVersion} -> ${newVersion}`);
    return newVersion;
}

function updateServiceWorker(newVersion) {
    let content = fs.readFileSync(SW_JS_PATH, 'utf8');
    // Extract version from vX.X.X to vX (cache version concept might differ, but let's just use the full version string or increment the cache suffix)
    // Existing: const CACHE_NAME = 'kirari-shuttle-v8';
    // Let's use the patch version as the cache counter or just newVersion

    // Simple approach: Increment the integer in 'kirari-shuttle-vX'
    const cacheMatch = content.match(/const CACHE_NAME = 'kirari-shuttle-v(\d+)';/);
    if (cacheMatch) {
        const currentCacheVer = parseInt(cacheMatch[1]);
        const newCacheVer = currentCacheVer + 1;
        content = content.replace(
            `const CACHE_NAME = 'kirari-shuttle-v${currentCacheVer}';`,
            `const CACHE_NAME = 'kirari-shuttle-v${newCacheVer}';`
        );
        fs.writeFileSync(SW_JS_PATH, content);
        console.log(`Updated sw.js Cache: v${currentCacheVer} -> v${newCacheVer}`);
    } else {
        console.warn('Could not find CACHE_NAME pattern in sw.js');
    }
}

function runCommand(command) {
    try {
        console.log(`Running: ${command}`);
        execSync(command, { stdio: 'inherit' });
    } catch (error) {
        console.error(`Error running command: ${command}`);
        process.exit(1);
    }
}

// Main
console.log('--- Starting Release Process ---');

// 1. Bump Version
const newVersion = updateCommonJs();
updateServiceWorker(newVersion);

// 2. Git Commit
runCommand('git add pwa/common.js pwa/sw.js');
runCommand(`git commit -m "Rel: Bump version to ${newVersion}"`);

// 3. Deploy
console.log('--- Deploying to GAS & GitHub ---');
runCommand('npm run push');
runCommand('npm run deploy');
runCommand('git push origin main');

console.log(`\nSUCCESS: Deployed version ${newVersion}`);
