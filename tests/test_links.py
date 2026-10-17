"""Ligações entre notas: links por nome de arquivo e Markdown, cadeia de origem, trilha e renomear."""

import shutil
import tempfile
import unittest
from pathlib import Path

from mk_manager.models.schemas import FileCreateRequest, FileUpdateRequest
from mk_manager.repositories.markdown import MarkdownFileRepository
from mk_manager.services.file_service import FileService
from mk_manager.services.links import NoteLink, extract_note_links


class TestExtractNoteLinks(unittest.TestCase):
    def test_wiki_and_markdown_in_order_ignoring_code(self):
        content = (
            "Veja [[Spec A|a spec]] e [runbook](k3s/03-instalacao.md#passo-1).\n"
            "`[[Dentro de crase]]` e ```\n[x](y.md)\n```\n"
            "Fora: [site](https://x.com/a.md) ![img](foto.md) [[Spec A]]"
        )
        self.assertEqual(
            extract_note_links(content),
            [NoteLink("Spec A", "wiki"), NoteLink("k3s/03-instalacao.md", "md")],
        )


class TestLinks(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.repo = MarkdownFileRepository(Path(self.temp_dir) / "notes")
        self.service = FileService(self.repo)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _new(self, title, content="", folder="", **kw):
        return self.service.create_file(FileCreateRequest(title=title, content=content, folder=folder, **kw))

    def test_link_by_filename_and_relative_markdown_path(self):
        alvo = self._new("03 · Runbook de instalação", folder="arq/k3s")
        origem = self._new(
            "Leitura", folder="arq", content=f"[[{alvo.id}]] e [passo](k3s/{alvo.id}.md)"
        )
        links = self.service.get_links(origem.id)
        self.assertEqual([r.id for r in links.outgoing], [alvo.id])
        self.assertEqual([r.id for r in self.service.get_links(alvo.id).backlinks], [origem.id])

    def test_origin_chain_and_children(self):
        proposta = self._new("Proposta X", folder="proposta")
        spec = self._new("Spec X", folder="spec", origin="[[Proposta X]]")
        task = self.service.create_file(
            FileCreateRequest(title="Fazer X", type="task", origin="Spec X", role="entrega")
        )
        links = self.service.get_links(task.id)
        self.assertEqual([r.id for r in links.ancestors], [proposta.id, spec.id])
        self.assertEqual(links.ancestors[0].role, "proposta")  # sem role: nome da pasta
        filhos = self.service.get_links(proposta.id).children
        self.assertEqual([r.id for r in filhos], [spec.id])
        self.assertEqual(self.service.get_links(spec.id).children[0].role, "entrega")

    def test_origin_cycle_does_not_loop(self):
        a = self._new("A", origin="B")
        self._new("B", origin="A")
        self.assertEqual([r.title for r in self.service.get_links(a.id).ancestors], ["B"])

    def test_trail_from_index_note(self):
        for t in ("Um", "Dois", "Tres"):
            self._new(t)
        self._new("Indice", content="1. [[Um]]\n2. [[Dois]]\n3. [[Tres]]", is_index=True)
        self._new("Comum", content="[[Dois]] [[Um]]")  # não é índice: não vira trilha
        self._new("Indice com texto", is_index=True, content="Antes, leia [[Tres]].\n\n| # | Doc |\n|---|---|\n| 1 | [[Um]] |\n| 2 | [[Dois]] |")
        trails = {t.index.title: t for t in self.service.get_links("dois").trails}
        self.assertEqual(set(trails), {"Indice", "Indice com texto"})
        self.assertEqual((trails["Indice"].position, trails["Indice"].total), (2, 3))
        self.assertEqual((trails["Indice"].prev.title, trails["Indice"].next.title), ("Um", "Tres"))
        # Link no parágrafo não é passo: a trilha da tabela tem só Um → Dois.
        self.assertEqual((trails["Indice com texto"].position, trails["Indice com texto"].total), (2, 2))
        self.assertEqual([t.index.title for t in self.service.get_links("tres").trails], ["Indice"])

    def test_rename_updates_links_and_origin(self):
        alvo = self._new("Spec Velha", folder="spec")
        citando = self._new(
            "Nota",
            folder="arq",
            content="[[Spec Velha|apelido]] [[spec-velha#sec]] [md](../spec/spec-velha.md) `[[Spec Velha]]`",
        )
        filho = self._new("Task", origin="[[Spec Velha]]")
        self.service.update_file(alvo.id, FileUpdateRequest(title="Spec Nova", folder="spec/v2"))
        conteudo = self.repo.get_by_id(citando.id).content
        self.assertEqual(
            conteudo,
            "[[Spec Nova|apelido]] [[spec-nova#sec]] [md](../spec/v2/spec-nova.md) `[[Spec Velha]]`",
        )
        self.assertEqual(self.repo.get_by_id(filho.id).origin, "[[Spec Nova]]")

    def test_saving_does_not_rename_file_when_title_is_unchanged(self):
        nota = self._new("00 leia primeiro")
        path = self.repo._require_path(nota.id)
        # Arquivo com nome diferente do slug do título, como os escritos à mão.
        path.write_text(path.read_text("utf-8").replace("title: 00 leia primeiro", "title: 00 · k3s — Leia primeiro"), "utf-8")
        self.repo.list_all()
        salvo = self.service.update_file(
            nota.id, FileUpdateRequest(title="00 · k3s — Leia primeiro", content="x")
        )
        self.assertEqual(salvo.filename, "00-leia-primeiro.md")
        renomeado = self.service.update_file(nota.id, FileUpdateRequest(title="Leia antes"))
        self.assertEqual(renomeado.filename, "leia-antes.md")

    def test_unknown_frontmatter_keys_survive_save(self):
        nota = self._new("Com extra")
        path = self.repo._require_path(nota.id)
        path.write_text(path.read_text("utf-8").replace("---\n", "---\nautor: Horacio\n", 1), "utf-8")
        self.repo.list_all()
        self.service.update_file(nota.id, FileUpdateRequest(content="novo"))
        self.assertIn("autor: Horacio", path.read_text("utf-8"))

    def test_map_lists_chains_with_task_progress_and_indexes(self):
        self._new("Proposta", folder="proposta")
        self._new("Spec", folder="spec", origin="Proposta")
        self.service.create_file(FileCreateRequest(title="T1", type="task", origin="Spec", status="done"))
        self.service.create_file(FileCreateRequest(title="T2", type="task", origin="Spec"))
        self._new("Solta")  # nota pessoal: sem origem nem derivadas, fica fora
        self._new("Indice", is_index=True, content="1. [[Proposta]]\n2. [[Spec]]\n3. [[Solta]]")
        mapa = self.service.build_map()

        self.assertEqual([c.note.title for c in mapa.chains], ["Proposta"])
        raiz = mapa.chains[0]
        self.assertEqual((raiz.tasks_total, raiz.tasks_done), (2, 1))
        self.assertEqual([t.note.title for t in raiz.children[0].children], ["T1", "T2"])
        passos = mapa.indexes[0].steps
        self.assertEqual([s.note.title for s in passos], ["Proposta", "Spec", "Solta"])
        self.assertEqual(passos[0].children, [])  # Spec já é o passo 2: não repete embaixo da Proposta
        self.assertEqual(passos[1].tasks_total, 2)

    def test_map_handles_origin_cycle(self):
        self._new("A", origin="B")
        self._new("B", origin="A")
        mapa = self.service.build_map()
        self.assertEqual(len(mapa.chains), 1)
        self.assertEqual(len(mapa.chains[0].children), 1)
        self.assertEqual(mapa.chains[0].children[0].children, [])


if __name__ == "__main__":
    unittest.main()
