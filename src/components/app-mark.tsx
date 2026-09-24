import { AppLogo } from '@/components/app-logo';
import { appConfig } from '@/config/app';

export function AppMark() {
  return (
    <div className="flex items-center gap-3" aria-label={appConfig.name}>
      <AppLogo name={appConfig.name} src={appConfig.logoUrl} />
      <span className="text-base font-semibold tracking-tight">
        {appConfig.name}
      </span>
    </div>
  );
}
