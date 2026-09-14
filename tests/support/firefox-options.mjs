// Let the installed packaged geckodriver select its matching Firefox executable.
export function firefoxOptions(binary) {
  if (binary === '/snap/bin/firefox') throw Error('Snap launcher is not a Firefox executable; omit --firefox for packaged auto-detection');
  return { ...(binary ? { binary } : {}), args: ['-headless'] };
}
