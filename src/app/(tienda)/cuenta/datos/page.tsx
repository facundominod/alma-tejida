import { redirect } from 'next/navigation'
import { ProfileForm } from '@/components/auth/profile-form'
import { getCurrentProfile } from '@/lib/supabase/server'

export const metadata = { title: 'Mis datos' }

export default async function MisDatosPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/ingresar?volver=/cuenta/datos')

  return (
    <div className="max-w-md">
      <ProfileForm
        fullName={profile.full_name ?? ''}
        email={profile.email ?? ''}
        phone={profile.phone ?? ''}
        acceptsMarketing={profile.accepts_marketing}
      />
    </div>
  )
}
