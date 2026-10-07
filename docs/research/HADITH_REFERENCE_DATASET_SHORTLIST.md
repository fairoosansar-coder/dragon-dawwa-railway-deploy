# Proposed Hadith reference datasets — licence and provenance decision list

**No candidate below is approved for automatic import.** Free web access, an API, a downloadable file, or open-source client code is not a licence to copy or transform the underlying Arabic text, translation, edition, narrator criticism, or grading. The Hadith Research Agents feature remains off and must not receive a corpus until the owner approves a source-by-source rights decision and a qualified reviewer approves the reference plan.

## Decision list

| Candidate | Relevant coverage | Licence / reuse position | Provenance strength | Recommended disposition |
| --- | --- | --- | --- | --- |
| **OpenITI corpus, pinned release** | Broad premodern Arabic corpus; may contain relevant works, but canonical collections, Musnad Ahmad, Taqrib al-Tahdhib and named grades were **not** confirmed title by title | Zenodo lists **CC BY-NC-SA 4.0** for release 2023.1.8, but OpenITI says much of the corpus derives from third-party digital collections with varying fidelity. A corpus-level declaration does not clear every included text/edition for this use. [1] [2] | Strong release/version/metadata model; uneven text quality and source provenance | **Permission required.** Use only after checking exact works/versions in a pinned release and receiving written clarification for each intended text/edition and intended use. |
| **HadeethEnc — Encyclopedia of Translated Prophetic Hadiths** | Curated recurring hadith with Arabic attribution, grade, explanation and references; not shown to be a complete canonical/Musnad/narrator corpus | Terms permit reuse subject to conditions including no modification/addition/deletion, source attribution and version/transcript information. No standard open-data licence was identified. [3] [4] | Project editorial process and record fields are documented; content changes continuously and a fixed corpus release was not found | **Permission required.** Potentially useful as a linked, source-attributed reference after permission; do not normalize, merge or transform it into a training/retrieval dataset without a written rights answer. |
| **Sunnah.com site / official API** | Lists the six canonical collections and Musnad Ahmad; documents displayed grades including al-Albani and Darussalam / Hafiz Zubair Ali Za'i; no verified Taqrib/narrator corpus | The site prohibits scraping and mass reproduction of collections. API access requires a key and no offline dump is offered. No underlying corpus licence was found. [5] [6] | Useful reference and grading-attribution context, but mixed source/translations and Arabic-English numbering differences require field-level handling | **Permission required.** Request a written, scope-specific API/data licence that covers exact collections, languages, volume, storage, transformation and provenance fields. |
| **Al-Maktaba al-Shamela** | Broad catalog of hadith, takhrij, hadith sciences and narrator-biography material; exact titles/editions are not verified in this assessment | Official terms preserve rights in books, editions and other materials for their holders and grant no reuse right beyond permission or applicable law. [7] | Rich book-level metadata but mutable catalogue and mixed editions | **Do not import without rights-holder permission.** Use only as a discovery catalogue for now; a software client’s MIT licence is not a content licence. |
| **Al-Maktaba al-Waqfeya** | Scan library categories cover Kutub al-Sitta, jarh wa ta'dil, musnads and other hadith compilations; exact desired titles/editions need verification | No data/content licence found. The project acknowledges publisher/author removal requests, confirming rights are unresolved at edition level. [8] [9] | Scan/book metadata exists but OCR and edition provenance require per-work verification | **Do not import without rights-holder permission.** Useful for locating candidate editions only. No scan, OCR or derivative text ingestion. |
| **Direct al-Albani / Shuayb al-Arnaut grading editions** | Required for the brief’s named grading layer | No reusable, authoritative public dataset licence was established. Sunnah.com documents al-Albani grades but describes al-Arnaut grades as future work, not current coverage. [5] | Must be anchored to a particular printed/digital edition, grading wording, cited hadith number/page and rights holder | **Direct publisher / rights-holder licence required.** Do not infer grades from a secondary site or combine grading systems into one synthetic label. |

## What this means for the Phase 2 data model

The six major collections, Musnad Ahmad, narrator criticism and scholarly grading are **separate provenance layers**. They must not be collapsed into one `hadith` record or one generic `grade` field.

1. **Primary-text layer:** exact Arabic edition, volume/page or canonical book/hadith reference, publisher/editor, text version and text-source hash.
2. **Translation layer:** translator/publisher, language, edition/version, translation-specific rights, and alignment to the Arabic reference. Tamil and Sinhala must not be presented as authoritative source text merely because the Arabic source is cleared.
3. **Narrator-criticism layer:** specific work/edition (for example, a licensed Taqrib al-Tahdhib edition), narrator identity resolution, quoted assessment, page/reference, editor/publisher and uncertainty marker.
4. **Grading layer:** named grader, exact quoted grade, source work/edition/page or hadith identifier, date/version and whether it is a direct primary attribution or a secondary display. Different scholars’ judgements must remain parallel records, never silently reconciled.
5. **Report layer:** report claim ID, cited sources/editions, retrieval timestamp, source-confidence notes and qualified-reviewer outcome. The agent may only cite approved records from these layers; it must not invent or infer a grade.

## Required provenance manifest for every authorised import

Before any content is loaded, create a signed-off manifest containing the fields below. Store the manifest separately from the source payload and retain it through source updates and deletion decisions.

```text
source_id                         immutable internal ID
rights_holder / contact            licence or written permission reference
rights_scope                       text, translation, metadata, grade, OCR, derivative/RAG use
source_url                         exact official source or delivery URL
source_release / retrieval_at      fixed release/tag/edition or timestamp
work / author / editor / publisher exact bibliographic edition details
collection / book / hadith_ref     original identifiers; preserve Arabic and translation numbering separately
language / translator              translation provenance, when applicable
grader / grade_source              direct named attribution and exact cited location
source_text_hash                   hash of the received authorised payload
transform_log                      normalization/OCR/alignment actions; none is implicit
review_status                      legal + qualified religious/editorial acceptance state
withdrawal / update policy         rights expiry, takedown contact and revalidation schedule
```

No import is permitted if `rights_scope`, exact edition, text hash, source reference, or qualified-review status is missing.

## Recommended approval sequence

**Conservative:** approve no corpus import. Keep all Phase 2 controls disabled and use only existing public bibliographic links while a qualified reviewer defines the exact sources needed.

**Balanced — recommended:** approve a rights-discovery phase only. Ask each relevant project/publisher for written clearance covering the narrow selected editions, private authenticated retrieval, storage, excerpting, conversion/indexing, update cadence, attribution, reviewer access and takedown handling. Begin with the six canonical Arabic editions, the required Musnad Ahmad edition, one licensed narrator-criticism edition and direct named-grade editions; do not buy or import until the terms are accepted.

**Aggressive:** acquire commercial/direct licences for specified print/digital editions and build the separate read-only reference schema. This creates the cleanest provenance but also adds rights cost, contract-management and long-term update obligations. It should wait until the qualified reviewer selects the exact editions and the owner accepts the commercial terms.

## Owner decisions requested

1. Approve or reject a **rights-discovery phase** for exact Arabic primary editions, one narrator-criticism edition and named grading works.
2. Decide whether HadeethEnc and Sunnah.com may be approached for a restricted, source-attributed API/data licence; neither should be imported under the currently observed terms.
3. Confirm whether Dragon Dawwa will accept only sources with a clear written licence for private retrieval/indexing, or whether it will negotiate limited commercial permissions.
4. Require the qualified hadith reviewer to select the exact Arabic editions, narrator work and grading citations before technical schema/import design begins.

## References

[1]: https://zenodo.org/records/10007820 "OpenITI: a Machine-Readable Corpus of Islamicate Texts, version 2023.1.8"
[2]: https://openiti.org/projects/OpenITI%20Corpus.html "OpenITI Corpus"
[3]: https://hadeethenc.com/en/home "Encyclopedia of Translated Prophetic Hadiths — Terms and Policies"
[4]: https://hadeethenc.com/api-docs/ "HadeethEnc API documentation"
[5]: https://sunnah.com/about "Sunnah.com About"
[6]: https://sunnah.com/developers "Sunnah.com Developers"
[7]: https://shamela.ws/page/terms "Al-Maktaba al-Shamela Terms of Use"
[8]: https://waqfeya.net/ "Al-Maktaba al-Waqfeya"
[9]: https://waqfeya.com/books/إيضاح-حول-طلبات-الكتب-cd6ac9c862e54273a61133a6ea439d1f "Al-Maktaba al-Waqfeya clarification on book requests"
