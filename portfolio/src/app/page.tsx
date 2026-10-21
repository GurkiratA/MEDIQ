import { About } from '@/components/About'
import { Contact } from '@/components/Contact'
import { Education } from '@/components/Education'
import { Hero } from '@/components/Hero'
import { Skills } from '@/components/Skills'
import { filled } from '@/components/Todo'
import { Work } from '@/components/Work'
import { links, profile, site } from '@/content/site'

// schema.org Person, so search engines can connect the name to the profiles.
const personJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: profile.name,
  url: site.url,
  jobTitle: profile.role,
  affiliation: { '@type': 'CollegeOrUniversity', name: profile.school },
  sameAs: [filled(links.github), filled(links.linkedin)].filter(Boolean),
}

export default function Home() {
  return (
    <>
      <div id="top" />
      <Hero />
      <Work />
      <About />
      <Skills />
      <Education />
      <Contact />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd).replace(/</g, '\\u003c') }}
      />
    </>
  )
}
