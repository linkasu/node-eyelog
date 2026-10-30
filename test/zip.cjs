// Small stored ZIP fixtures, including Unix symlink metadata; no external fixture tools.
function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

module.exports = function zip(entries) {
    const local = [];
    const central = [];
    let offset = 0;
    for (const { name, data = 'fixture', mode = 0o100644 } of entries) {
        const filename = Buffer.from(name);
        const content = Buffer.from(data);
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50);
        header.writeUInt16LE(20, 4);
        header.writeUInt32LE(crc32(content), 14);
        header.writeUInt32LE(content.length, 18);
        header.writeUInt32LE(content.length, 22);
        header.writeUInt16LE(filename.length, 26);
        const directory = Buffer.alloc(46);
        directory.writeUInt32LE(0x02014b50);
        directory.writeUInt16LE(0x0314, 4);
        directory.writeUInt16LE(20, 6);
        header.copy(directory, 16, 14, 26);
        directory.writeUInt16LE(filename.length, 28);
        directory.writeUInt32LE((mode * 65536) >>> 0, 38);
        directory.writeUInt32LE(offset, 42);
        local.push(header, filename, content);
        central.push(directory, filename);
        offset += header.length + filename.length + content.length;
    }
    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, directory, end]);
};
