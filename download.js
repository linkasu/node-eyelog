const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const decompress = require('decompress');

const VERSION = "1.1.1.0";
const REPO = "linkasu/EyeLog";

async function main() {
    const tmpZip = path.join(__dirname, 'Release.zip');
    try {
        execSync(
            `gh release download ${VERSION} --repo ${REPO} --pattern "Release.zip" --dir "${__dirname}" --clobber`,
            { stdio: 'inherit' }
        );
    } catch {
        execSync(
            `curl -fSL -o "${tmpZip}" "https://github.com/${REPO}/releases/download/${VERSION}/Release.zip"`,
            { stdio: 'inherit' }
        );
    }
    await decompress(tmpZip, path.join(__dirname, 'bin'));
    fs.unlinkSync(tmpZip);
}
main();
