import { Router } from "express";
import { HttpError } from "../../lib/http-error.js";

export const cepRouter = Router();

/** Consulta o ViaCEP para autopreencher o endereço no cadastro. */
cepRouter.get("/:cep", async (req, res) => {
  const cep = req.params.cep.replace(/\D/g, "");
  if (cep.length !== 8) throw new HttpError(400, "CEP inválido");

  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if (!response.ok) throw new HttpError(502, "Falha ao consultar o ViaCEP");

  const data = (await response.json()) as Record<string, string | boolean>;
  if (data.erro) throw new HttpError(404, "CEP não encontrado");

  res.json({
    zipCode: `${cep.slice(0, 5)}-${cep.slice(5)}`,
    street: data.logradouro,
    district: data.bairro,
    city: data.localidade,
    state: data.uf,
  });
});
