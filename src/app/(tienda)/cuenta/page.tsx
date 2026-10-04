import { redirect } from 'next/navigation'

// "Mi cuenta" es, en la practica, "Mis pedidos". Una pantalla intermedia que
// solo tiene enlaces a las otras no le sirve a nadie.
export default function CuentaPage() {
  redirect('/cuenta/pedidos')
}
