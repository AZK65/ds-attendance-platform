'use client'

import Image from 'next/image'
import { useT } from '@/app/register/i18n'

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || '/'

export function QaziFooter() {
  const { t } = useT()
  return (
    <footer className="border-t border-[#0B0B0F]/5 bg-white text-[#0B0B0F]">
      <div className="mx-auto max-w-[1200px] px-6 pt-20 pb-10">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <h3 className="text-[40px] md:text-[52px] leading-[1] tracking-[-0.03em]">
              {t.footer.h1a}
              <span className="font-serif italic font-normal text-[#E11D2E]"> {t.footer.h1b}</span>
              {t.footer.h1c}
            </h3>
            <p className="mt-6 max-w-sm text-[15px] text-[#0B0B0F]/60 leading-relaxed">
              {t.footer.lead}
            </p>
          </div>

          <div className="md:col-span-3 md:col-start-7">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#0B0B0F]/45">{t.footer.contact}</div>
            <ul className="mt-5 space-y-2 text-[15px] text-[#0B0B0F]/80">
              <li>(514) 555-0199</li>
              <li>info@qazi.ca</li>
              <li className="text-[#0B0B0F]/55 pt-2">{t.footer.cities}</li>
            </ul>
          </div>

          <div className="md:col-span-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#0B0B0F]/45">{t.footer.follow}</div>
            <ul className="mt-5 space-y-2 text-[15px] text-[#0B0B0F]/80">
              <li><a href="#" className="hover:text-[#E11D2E]">Instagram</a></li>
              <li><a href="#" className="hover:text-[#E11D2E]">Facebook</a></li>
              <li><a href="#" className="hover:text-[#E11D2E]">TikTok</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-20 pt-6 border-t border-[#0B0B0F]/10 flex flex-col sm:flex-row justify-between gap-3 text-[12px] text-[#0B0B0F]/45">
          <div className="flex items-center gap-2.5">
            <a href={MARKETING_URL} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <Image
                src="/qazi-logo.png"
                alt=""
                width={72}
                height={24}
                className="h-6 w-auto opacity-80"
              />
              <span>© {new Date().getFullYear()} {t.footer.rights}</span>
            </a>
          </div>
          <span>{t.footer.saaq}</span>
        </div>
      </div>
    </footer>
  )
}
