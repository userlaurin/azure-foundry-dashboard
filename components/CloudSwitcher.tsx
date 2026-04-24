'use client';

export type CloudProvider = 'azure' | 'aws';

export function CloudSwitcher({
  value,
  onChange,
}: {
  value: CloudProvider;
  onChange: (v: CloudProvider) => void;
}) {
  return (
    <div className="cloud-switcher" role="tablist" aria-label="Cloud provider">
      {(['azure', 'aws'] as const).map((provider) => (
        <button
          key={provider}
          role="tab"
          aria-selected={value === provider}
          className={value === provider ? `active ${provider}` : ''}
          onClick={() => onChange(provider)}
        >
          {provider === 'azure' ? 'Azure' : 'AWS'}
        </button>
      ))}
    </div>
  );
}
