export async function renderShareQr(url: string): Promise<string> {
  const { default: qrcode } = await import('qrcode-generator');
  const code = qrcode(0, 'H');
  code.addData(url);
  code.make();

  const modules = code.getModuleCount();
  const quietZone = 4;
  const scale = 12;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = (modules + quietZone * 2) * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('二维码不可用');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#18392d';
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (code.isDark(row, col)) {
        context.fillRect((col + quietZone) * scale, (row + quietZone) * scale, scale, scale);
      }
    }
  }

  const logo = new Image();
  logo.src = 'assets/pocklo.svg';
  if (await logo.decode().then(() => true, () => false)) {
    // Keep the logo in a small, module-aligned patch inside the QR's correction budget.
    const badgeSize = (modules >= 41 ? 7 : 5) * scale;
    const edge = (canvas.width - badgeSize) / 2;
    context.fillStyle = '#fff';
    context.fillRect(edge, edge, badgeSize, badgeSize);
    context.drawImage(logo, edge + scale / 2, edge + scale / 2, badgeSize - scale, badgeSize - scale);
  }
  return canvas.toDataURL('image/png');
}
