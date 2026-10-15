/**
 * Trava de rolagem da página compartilhada pelos painéis (bottom sheets).
 *
 * Usa um contador: a trava só é aplicada no primeiro painel aberto e só é desfeita quando
 * o último fecha. Antes cada painel guardava e restaurava o `overflow` do body por conta
 * própria; com dois painéis abertos (ex.: treino + exercício) e re-renderizações (o
 * cronômetro de descanso re-renderiza 4x por segundo), um deles acabava guardando
 * "hidden" como valor original e a página ficava sem rolar depois de fechar tudo.
 */
let locks = 0
let original = ''

/** Trava a rolagem e devolve a função que destrava (pode ser chamada mais de uma vez). */
export function lockScroll(): () => void {
  if (locks === 0) {
    original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  locks++
  let released = false
  return () => {
    if (released) return
    released = true
    locks = Math.max(0, locks - 1)
    if (locks === 0) document.body.style.overflow = original
  }
}
