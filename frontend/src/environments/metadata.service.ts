export function getMetadata<T = string>(name: string, defaultValue: T | null = null): null | T {
  const metaElem: HTMLMetaElement | null = document.head.querySelector(`meta[name="${name}"]`);

  if (metaElem) {
    const content = metaElem.getAttribute('content');

    metaElem.remove();

    if (content && content?.length > 0 && !content.includes('<%')) {
      return content as T;
    }
  }

  return defaultValue;
}

export function getMetadataAsArray<T>(name: string): T[] | null {
  const value = getMetadata(name);
  if (!value || !value.startsWith('[') || !value.endsWith(']')) {
    return null;
  }
  return value
    .slice(1, -1)
    .split(',')
    .map((item) => item.trim()) as T[];
}

export function getMetadataAsBoolean(name: string, defaultValue: boolean | null = null): boolean | null {
  const value = getMetadata(name);

  if (value != null) {
    return value === 'true';
  }

  return defaultValue;
}

export function getMetadataAsNumber(name: string, defaultValue: number | null = null): number | null {
  const value = getMetadata(name);

  if (value != null) {
    const parsed = Number.parseInt(value, 10);

    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return defaultValue;
}

export function getMetadataAsObject<T>(name: string): T | null {
  const value = getMetadata(name);
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch (e) {
    console.error(`Error parsing metadata as object: ${e}`);
    return null;
  }
}

export function hasMetadata(name: string): boolean | null {
  const meta = document.head.querySelector(`meta[name="${name}"]`);
  const content = meta?.getAttribute('content');

  return !!content && content?.length > 0 && !content.includes('<%=');
}

export function getHostUrl() {

  let url = window.location.protocol + "//" + window.location.host;
  return url
}
