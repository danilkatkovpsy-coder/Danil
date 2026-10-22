(() => {
	const encoder = new TextEncoder();
	const table = Uint32Array.from({ length: 256 }, (_, value) => {
		for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		return value >>> 0;
	});
	const crc32 = bytes => {
		let value = 0xffffffff;
		for (const byte of bytes) value = table[(value ^ byte) & 255] ^ (value >>> 8);
		return (value ^ 0xffffffff) >>> 0;
	};
	function createInvoiceZip(files) {
		if (!files.length || files.length > 65535) throw new Error('Архив должен содержать от 1 до 65535 файлов.');
		const local = [], central = [], names = new Set();
		let offset = 0, centralSize = 0;
		for (const file of files) {
			if (!(file.bytes instanceof Uint8Array) || !/^[A-Za-z0-9_-]+\.pdf$/.test(file.name) || names.has(file.name)) {
				throw new Error('Некорректный файл счета для архива.');
			}
			names.add(file.name);
			const name = encoder.encode(file.name), size = file.bytes.length, crc = crc32(file.bytes);
			if (size > 0xffffffff || offset + 30 + name.length + size > 0xffffffff) throw new Error('Архив слишком большой. Скачайте счета частями.');
			const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
			h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true);
			h.setUint16(12, 33, true); h.setUint32(14, crc, true);
			h.setUint32(18, size, true); h.setUint32(22, size, true);
			h.setUint16(26, name.length, true); header.set(name, 30);
			local.push(header, file.bytes);
			const directory = new Uint8Array(46 + name.length), d = new DataView(directory.buffer);
			d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true);
			d.setUint16(14, 33, true); d.setUint32(16, crc, true);
			d.setUint32(20, size, true); d.setUint32(24, size, true);
			d.setUint16(28, name.length, true); d.setUint32(42, offset, true); directory.set(name, 46);
			central.push(directory); centralSize += directory.length; offset += header.length + size;
		}
		if (offset + centralSize + 22 > 0xffffffff) throw new Error('Архив слишком большой. Скачайте счета частями.');
		const end = new Uint8Array(22), e = new DataView(end.buffer);
		e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
		e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
		return new Blob([...local, ...central, end], { type: 'application/zip' });
	}
	if (typeof module !== 'undefined' && module.exports) module.exports = { createInvoiceZip };
	else window.createInvoiceZip = createInvoiceZip;
})();
