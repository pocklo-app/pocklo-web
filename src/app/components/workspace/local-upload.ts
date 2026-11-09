export interface UploadEntry {
  path: string[];
  file?: File;
}

export function localDrop(data: DataTransfer) {
  const files = Array.from(data.files);
  const items = Array.from(data.items).filter(item => item.kind === 'file');
  const entries = items.map(item => ({
    entry: item.webkitGetAsEntry?.(),
    file: item.getAsFile(),
  }));

  return async (): Promise<UploadEntry[]> => {
    const result: UploadEntry[] = [];
    async function read(entry: FileSystemEntry, parent: string[]) {
      const path = [...parent, entry.name];
      if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
        result.push({ path: parent, file });
      } else if (entry.isDirectory) {
        result.push({ path });
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        while (true) {
          const children = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
          if (!children.length) break;
          for (const child of children) await read(child, path);
        }
      }
    }
    if (!entries.length) return files.map(file => ({ path: [], file }));
    for (const [index, { entry, file }] of entries.entries()) {
      if (entry) await read(entry, []);
      else if (file || files[index]) result.push({ path: [], file: file || files[index] });
      else throw new Error('无法读取拖入的项目，请使用「上传文件夹」重试。');
    }
    return result;
  };
}
