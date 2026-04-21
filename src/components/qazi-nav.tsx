'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, Globe } from 'lucide-react'
import { useT, type Lang } from '@/app/register/i18n'

function LangSwitcher({ onDark }: { onDark: boolean }) {
  const { lang, setLang } = useT()

  const options: Lang[] = ['fr', 'en']
  const labels: Record<Lang, string> = { fr: 'FR', en: 'EN' }

  const trackBg = onDark ? 'bg-white/10 border-white/15' : 'bg-[#0B0B0F]/5 border-[#0B0B0F]/10'
  const iconCls = onDark ? 'text-white/70' : 'text-[#0B0B0F]/55'
  const inactiveText = onDark ? 'text-white/60' : 'text-[#0B0B0F]/55'

  return (
    <div
      className={`inline-flex items-center gap-1.5 h-9 pl-2.5 pr-1 rounded-full border ${trackBg} transition-colors`}
      role="group"
      aria-label="Language"
    >
      <Globe className={`h-3.5 w-3.5 ${iconCls}`} aria-hidden />
      <div className="relative flex items-center">
        {options.map((code) => {
          const active = code === lang
          return (
            <button
              key={code}
              type="button"
              aria-pressed={active}
              onClick={() => setLang(code)}
              className="relative z-10 h-7 px-2.5 text-[11.5px] font-semibold tracking-[0.12em] rounded-full inline-flex items-center justify-center transition-colors"
            >
              {active && (
                <motion.span
                  layoutId={onDark ? 'lang-pill-dark' : 'lang-pill'}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className={`absolute inset-0 rounded-full ${onDark ? 'bg-white' : 'bg-[#0B0B0F]'}`}
                />
              )}
              <span className={`relative z-10 ${active ? (onDark ? 'text-[#0B0B0F]' : 'text-white') : inactiveText}`}>
                {labels[code]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const MARKETING = process.env.NEXT_PUBLIC_MARKETING_URL || ''

// Build URLs that resolve to the marketing site if configured, otherwise use
// relative paths (dev proxy serves the marketing app on the same origin).
const m = (path: string) => `${MARKETING}${path}`

export function QaziNav() {
  const { t } = useT()
  const parcoursItems = [
    { href: m('/parcours'), label: t.nav.courseCar, meta: t.nav.courseCarMeta },
    { href: m('/parcours/camion'), label: t.nav.courseTruck, meta: t.nav.courseTruckMeta },
  ]
  const [scrolled, setScrolled] = useState(false)
  const [parcoursMenu, setParcoursMenu] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
      window.addEventListener('keydown', onKey)
      return () => {
        document.body.style.overflow = prev
        window.removeEventListener('keydown', onKey)
      }
    }
  }, [mobileOpen])

  const onDark = !scrolled && !mobileOpen
  const toneMuted = onDark ? 'text-white/75' : 'text-[#0B0B0F]/70'

  return (
    <>
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={`fixed top-0 inset-x-0 z-50 border-b transition-colors duration-300 ${
          onDark ? 'bg-transparent border-white/0' : 'bg-white/95 backdrop-blur-md border-[#0B0B0F]/5'
        }`}
      >
        <div className="mx-auto max-w-[1200px] px-6 h-16 flex items-center justify-between">
          <a href={m('/')} className="flex items-center gap-2.5">
            <Image
              src="/qazi-logo.png"
              alt="Qazi"
              width={96}
              height={32}
              className={`h-8 w-auto transition ${onDark ? 'drop-shadow-[0_2px_10px_rgba(0,0,0,0.4)]' : ''}`}
              priority
            />
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-9">
            <div
              className="relative"
              onMouseEnter={() => setParcoursMenu(true)}
              onMouseLeave={() => setParcoursMenu(false)}
            >
              <a
                href={m('/parcours')}
                className={`inline-flex items-center gap-1 text-[13.5px] transition-colors hover:text-[#E11D2E] ${toneMuted}`}
                aria-haspopup="true"
                aria-expanded={parcoursMenu}
              >
                {t.nav.courses}
                <motion.span animate={{ rotate: parcoursMenu ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-flex">
                  <ChevronDown className="h-3.5 w-3.5" />
                </motion.span>
              </a>
              <AnimatePresence>
                {parcoursMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute left-1/2 -translate-x-1/2 top-full pt-3 z-50"
                  >
                    <div className="min-w-[220px] rounded-xl border border-[#0B0B0F]/10 bg-white shadow-lg shadow-black/10 p-1.5">
                      {parcoursItems.map(({ href, label, meta }) => (
                        <a
                          key={href}
                          href={href}
                          className="group flex items-center justify-between gap-6 px-3 py-2.5 rounded-lg hover:bg-[#F7F7F5] transition-colors"
                        >
                          <span className="text-[14px] text-[#0B0B0F] group-hover:text-[#E11D2E]">{label}</span>
                          <span className="text-[11px] uppercase tracking-[0.15em] text-[#0B0B0F]/45">{meta}</span>
                        </a>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <a href={m('/#courses')} className={`text-[13.5px] transition-colors hover:text-[#E11D2E] ${toneMuted}`}>
              {t.nav.packages}
            </a>
            <a href={m('/#contact')} className={`text-[13.5px] transition-colors hover:text-[#E11D2E] ${toneMuted}`}>
              {t.nav.contact}
            </a>
          </nav>

          {/* Right cluster */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <LangSwitcher onDark={onDark} />
            </div>
            <span
              aria-current="page"
              className={`hidden sm:inline-flex items-center h-9 px-4 rounded-full text-[13px] font-medium ${
                onDark ? 'bg-white/10 text-white border border-white/20' : 'bg-[#0B0B0F]/5 text-[#0B0B0F]/60 border border-[#0B0B0F]/10'
              }`}
            >
              {t.nav.signup}
            </span>

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              className="md:hidden relative h-10 w-10 inline-flex items-center justify-center rounded-full"
            >
              <span className="relative block h-4 w-[22px]">
                <motion.span
                  aria-hidden
                  className={`absolute left-0 right-0 top-[3px] h-[1.5px] rounded-full ${onDark ? 'bg-white' : 'bg-[#0B0B0F]'}`}
                  animate={mobileOpen ? { y: 5, rotate: 45 } : { y: 0, rotate: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                />
                <motion.span
                  aria-hidden
                  className={`absolute left-0 right-0 top-[3px] mt-[5px] h-[1.5px] rounded-full ${onDark ? 'bg-white' : 'bg-[#0B0B0F]'}`}
                  animate={mobileOpen ? { opacity: 0 } : { opacity: 1 }}
                  transition={{ duration: 0.15 }}
                />
                <motion.span
                  aria-hidden
                  className={`absolute left-0 right-0 top-[3px] mt-[10px] h-[1.5px] rounded-full ${onDark ? 'bg-white' : 'bg-[#0B0B0F]'}`}
                  animate={mobileOpen ? { y: -5, rotate: -45 } : { y: 0, rotate: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                />
              </span>
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <MobileMenu onClose={() => setMobileOpen(false)} parcoursItems={parcoursItems} />
        )}
      </AnimatePresence>
    </>
  )
}

function MobileMenu({
  onClose,
  parcoursItems,
}: {
  onClose: () => void
  parcoursItems: { href: string; label: string; meta: string }[]
}) {
  const { t } = useT()
  const [parcoursExpanded, setParcoursExpanded] = useState(false)

  const links: Array<
    | { href: string; label: string; sub: typeof parcoursItems }
    | { href: string; label: string }
  > = [
    { href: m('/parcours'), label: t.nav.courses, sub: parcoursItems },
    { href: m('/#courses'), label: t.nav.packages },
    { href: m('/#contact'), label: t.nav.contact },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="md:hidden fixed inset-x-0 top-16 bottom-0 z-40 bg-[#0B0B0F] text-white overflow-y-auto"
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 80% 0%, rgba(225,29,46,0.35) 0%, transparent 50%), radial-gradient(ellipse at 0% 100%, rgba(30,58,138,0.35) 0%, transparent 55%)',
        }}
      />

      <motion.nav
        initial="closed"
        animate="open"
        exit="closed"
        variants={{
          open: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
          closed: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
        }}
        className="relative px-6 pt-10 pb-8"
      >
        <ul className="space-y-1">
          {links.map((link) => (
            <motion.li
              key={link.href}
              variants={{
                open: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
                closed: { opacity: 0, y: 16, transition: { duration: 0.2 } },
              }}
            >
              {'sub' in link ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setParcoursExpanded((v) => !v)}
                    aria-expanded={parcoursExpanded}
                    className="group w-full flex items-center justify-between py-3 border-b border-white/10 text-left"
                  >
                    <span
                      className={`text-[44px] md:text-[56px] tracking-[-0.03em] leading-[1] transition-colors ${
                        parcoursExpanded ? 'text-[#E11D2E]' : 'text-white group-hover:text-[#E11D2E]'
                      }`}
                    >
                      {link.label}
                    </span>
                    <motion.span
                      animate={{ rotate: parcoursExpanded ? 180 : 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="inline-flex text-white/55"
                      aria-hidden
                    >
                      <ChevronDown className="h-5 w-5" />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {parcoursExpanded && (
                      <motion.div
                        key="parcours-sub"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <motion.ul
                          initial="closed"
                          animate="open"
                          exit="closed"
                          variants={{
                            open: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
                            closed: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
                          }}
                          className="mt-3 mb-3 pl-1 space-y-1.5"
                        >
                          {link.sub.map((s) => (
                            <motion.li
                              key={s.href}
                              variants={{
                                open: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
                                closed: { opacity: 0, x: -8, transition: { duration: 0.15 } },
                              }}
                            >
                              <a href={s.href} onClick={onClose} className="group flex items-baseline gap-3 py-1 text-[17px]">
                                <span className="font-serif italic text-[#E11D2E]">→</span>
                                <span className="text-white/85 group-hover:text-white transition-colors">{s.label}</span>
                                <span className="text-[10.5px] uppercase tracking-[0.2em] text-white/35">{s.meta}</span>
                              </a>
                            </motion.li>
                          ))}
                        </motion.ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <a
                  href={link.href}
                  onClick={onClose}
                  className="group flex items-baseline justify-between py-3 border-b border-white/10"
                >
                  <span className="text-[44px] md:text-[56px] tracking-[-0.03em] leading-[1] text-white group-hover:text-[#E11D2E] transition-colors">
                    {link.label}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.22em] text-white/45">→</span>
                </a>
              )}
            </motion.li>
          ))}
        </ul>

        <motion.div
          variants={{
            open: { opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.22, ease: [0.22, 1, 0.36, 1] } },
            closed: { opacity: 0, y: 16 },
          }}
          className="mt-10 space-y-5"
        >
          <span
            aria-current="page"
            className="inline-flex w-full items-center justify-center gap-2 h-14 rounded-full bg-white/10 text-white/70 border border-white/20 text-[15px] font-semibold"
          >
            {t.nav.signupCurrent}
          </span>

          <div className="flex items-center justify-between pt-2">
            <LangSwitcher onDark />
            <a href="tel:+15145550199" className="text-[13.5px] text-white/70 hover:text-white">
              (514) 555-0199
            </a>
          </div>
        </motion.div>

        <motion.div
          variants={{
            open: { opacity: 1, transition: { duration: 0.6, delay: 0.35 } },
            closed: { opacity: 0 },
          }}
          className="mt-16 text-[11px] uppercase tracking-[0.22em] text-white/35"
        >
          Montréal · Laval · Longueuil
        </motion.div>
      </motion.nav>
    </motion.div>
  )
}
