export const FILE_TYPES: Record<string, { label: string; extensions: string }> = {
  folder: { label: '目录', extensions: '' },
  pdf: { label: 'PDF', extensions: 'pdf' },
  image: { label: '图片', extensions: 'png jpg jpeg gif webp avif heic heif bmp tiff tif ico dng raw cr2 nef arw' },
  video: { label: '视频', extensions: 'mp4 m4v mov mkv webm avi wmv flv mpeg mpg ts m2ts 3gp' },
  audio: { label: '音频', extensions: 'mp3 wav flac aac m4a ogg opus aiff wma mid midi' },
  markdown: { label: 'Markdown', extensions: 'md markdown mdown mdx' },
  text: { label: '文本', extensions: 'txt log nfo' },
  link: { label: '链接', extensions: 'url webloc desktop' },
  document: { label: '文档', extensions: 'doc docx docm odt rtf pages wps' },
  sheet: { label: '表格', extensions: 'xls xlsx xlsm ods csv tsv numbers et' },
  slides: { label: '演示文稿', extensions: 'ppt pptx pptm odp key dps' },
  archive: { label: '压缩包', extensions: 'zip rar 7z tar gz bz2 xz zst tgz tbz tbz2 txz' },
  code: { label: '源代码', extensions: 'js jsx ts tsx py rb php go rs java kt swift c h cpp hpp cs sh bash zsh ps1 bat sql lua r dart scala vue svelte ipynb' },
  web: { label: '网页', extensions: 'html htm xhtml css scss sass less mhtml' },
  data: { label: '数据与配置', extensions: 'json jsonl xml yaml yml toml ini conf cfg env plist parquet arrow avro' },
  executable: { label: '程序与安装包', extensions: 'exe msi apk aab app pkg deb rpm appimage jar dll so dylib ipa' },
  font: { label: '字体', extensions: 'ttf otf ttc woff woff2 eot' },
  ebook: { label: '电子书', extensions: 'epub mobi azw azw3 fb2 cbz cbr' },
  vector: { label: '矢量图', extensions: 'svg svgz ai eps emfs emf wmf' },
  design: { label: '设计文件', extensions: 'psd psb sketch fig xd indd idml xcf afdesign' },
  database: { label: '数据库', extensions: 'db sqlite sqlite3 dbf mdb accdb' },
  disk: { label: '磁盘映像', extensions: 'iso dmg img vhd vhdx vmdk qcow2' },
  subtitle: { label: '字幕', extensions: 'srt vtt ass ssa sub' },
  cad: { label: '3D 与 CAD', extensions: 'dwg dxf step stp iges igs stl obj fbx glb gltf blend 3mf' },
  file: { label: '文件', extensions: '' },
};
const TYPE_BY_EXTENSION = new Map(
  Object.entries(FILE_TYPES).flatMap(([type, { extensions }]) =>
    extensions.split(' ').filter(Boolean).map(extension => [extension, type] as const)),
);

export function fileIconType(item: { folder: boolean; name: string; preview: string | null }) {
  if (item.folder) return 'folder';
  if (item.preview === 'link') return 'link';
  const extension = item.name.includes('.') ? item.name.split('.').pop().toLowerCase() : '';
  return TYPE_BY_EXTENSION.get(extension) || item.preview || 'file';
}
