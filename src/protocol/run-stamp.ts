let lastBaseStamp = "";
let sameStampSequence = 0;

export function runStamp(): string {
  const baseStamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 17);

  if (baseStamp === lastBaseStamp) {
    sameStampSequence += 1;
  } else {
    lastBaseStamp = baseStamp;
    sameStampSequence = 0;
  }

  return sameStampSequence === 0
    ? baseStamp
    : `${baseStamp}_${String(sameStampSequence).padStart(3, "0")}`;
}
