import { About } from '@/components/About'
import { Contact } from '@/components/Contact'
import { Footer } from '@/components/Footer'
import { Hero } from '@/components/Hero'
import { Nav } from '@/components/Nav'
import { Path } from '@/components/Path'
import { Reveal } from '@/components/Reveal'
import { Skills } from '@/components/Skills'
import { Work } from '@/components/Work'
import { links, profile, site } from '@/content/site'
import { filled } from '@/components/Todo'

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
      <Nav />
      <main id="main" tabIndex={-1}>
        <div id="top" />
        <Hero />
        <Work />
        <About />
        <Skills />
        <Path />
        <Contact />
      </main>
      <Footer />
      <Reveal />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd).replace(/</g, '\\u003c') }}
      />
    </>
  )
}
