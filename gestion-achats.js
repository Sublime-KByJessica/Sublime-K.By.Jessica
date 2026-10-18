/* =========================================================
   Sublime’K — Gestion des achats, fournisseurs et coûts
   Ce fichier utilise uniquement les tables dédiées sk_.
   Il ne modifie jamais les prix des produits de la boutique.
   ========================================================= */

(() => {
  "use strict";

  const TABLES = {
    fournisseurs: "sk_fournisseurs",
    achats: "sk_achats",
    lignesAchats: "sk_achats_lignes",
    consommables: "sk_consommables",
    couts: "sk_couts_produits",
    lignesCouts: "sk_couts_lignes"
  };

  const euro = valeur =>
    (Number(valeur) || 0).toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR"
    });

  const nombre = valeur => {
    const n = Number(String(valeur ?? "0").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  const echapper = valeur =>
    String(valeur ?? "").replace(/[&<>"']/g, caractere => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[caractere]);

  function obtenirClient() {
    if (window.client) return window.client;
    if (window.supabaseClient) return window.supabaseClient;

    throw new Error(
      "Connexion Supabase introuvable. Vérifie le chargement du client admin."
    );
  }

  async function lire(table, colonnes = "*") {
    const { data, error } = await obtenirClient()
      .from(table)
      .select(colonnes);

    if (error) throw error;
    return data || [];
  }

  
async function enregistrer(table, valeurs, id = null) {
  const requete = obtenirClient().from(table);

  const resultat = id
    ? await requete.update(valeurs).eq("id", id).select()
    : await requete.insert(valeurs).select();

  if (resultat.error) {
    throw resultat.error;
  }

  if (!resultat.data || resultat.data.length === 0) {
    throw new Error(
      id
        ? `Aucune ligne mise à jour dans ${table} : identifiant introuvable ou modification refusée.`
        : `Aucune ligne créée dans ${table}.`
    );
  }

  return resultat.data;
}

  async function supprimer(table, id) {
    const { error } = await obtenirClient()
      .from(table)
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  function afficherMessage(message, erreur = false) {
    const zone = document.getElementById("skMessageGestion");
    if (!zone) {
      if (erreur) console.error(message);
      else console.info(message);
      return;
    }

    zone.textContent = message;
    zone.style.display = "block";
    zone.style.padding = "10px";
    zone.style.margin = "10px 0";
    zone.style.borderRadius = "8px";
    zone.style.background = erreur ? "#fff0f0" : "#edf5e8";
    zone.style.color = erreur ? "#8a3030" : "#355a38";
  }

  async function securiser(action) {
    try {
      await action();
    } catch (erreur) {
      console.error("Gestion Sublime’K :", erreur);
      afficherMessage(
        erreur.message || "Une erreur est survenue.",
        true
      );
    }
  }

  function verifierUrl(url) {
    if (!url) return null;

    try {
      const adresse = new URL(url);
      if (!["https:", "http:"].includes(adresse.protocol)) {
        throw new Error();
      }
      return adresse.href;
    } catch {
      throw new Error("Le lien doit être une adresse web valide (https://…).");
    }
  }

   
  // REPÈRE — AFFICHER LES ERREURS DE VALIDATION DES FORMULAIRES
  // Le navigateur peut bloquer l'envoi avant l'événement "submit".
  document.addEventListener("invalid", evenement => {
    const champ = evenement.target;
    const formulaire = champ?.form;

    if (!formulaire || ![
      "skFormFournisseur",
      "skFormConsommable",
      "skFormAchat",
      "skFormCout"
    ].includes(formulaire.id)) return;

    let message = "Vérifie les champs obligatoires du formulaire.";

    if (champ.validity?.valueMissing) {
      const libelle = formulaire.querySelector(
        `label[for="${champ.id}"]`
      );

      message = libelle
        ? `Le champ « ${libelle.textContent.trim().replace(/\*$/, "").trim()} » est obligatoire.`
        : "Un champ obligatoire doit être renseigné.";
    } else if (champ.validity?.typeMismatch && champ.type === "url") {
      message = "Le lien saisi n'est pas une adresse web valide. Utilise https://…";
    } else if (
      champ.validity?.rangeUnderflow ||
      champ.validity?.rangeOverflow
    ) {
      message = "Une valeur est en dehors des limites autorisées.";
    }

    const zone = document.getElementById("skMessageGestion");

    if (zone) {
      zone.textContent = message;
      zone.style.display = "block";
      zone.style.padding = "10px";
      zone.style.margin = "10px 0";
      zone.style.borderRadius = "8px";
      zone.style.background = "#fff0f0";
      zone.style.color = "#8a3030";
    }
  }, true);

  /* ---------------- FOURNISSEURS ---------------- */

  
  async function chargerFournisseurs() {
    const fournisseurs = await lire(
      TABLES.fournisseurs,
      "id,nom,site_url,contact,notes,actif"
    );

    const selectAchat = document.getElementById("skAchatFournisseur");

    if (selectAchat) {
      const valeurActuelle = selectAchat.value;

      selectAchat.innerHTML =
        '<option value="">Choisir un fournisseur</option>' +
        fournisseurs
          .filter(f => f.actif)
          .map(f => `
            <option value="${echapper(f.id)}">
              ${echapper(f.nom)}
            </option>
          `)
          .join("");

      if (valeurActuelle) {
        selectAchat.value = valeurActuelle;
      }
    }

    const zone = document.getElementById("skFournisseursListe");
    if (!zone) return fournisseurs;

    zone.innerHTML = fournisseurs.length
      ? fournisseurs.map(f => `
          <article class="sk-carte">
            <strong>${echapper(f.nom)}</strong>
            <p>${echapper(f.contact || "Aucun contact renseigné")}</p>
            ${f.site_url
              ? `<p><a href="${echapper(f.site_url)}"
                   target="_blank" rel="noopener noreferrer">
                   Ouvrir le site fournisseur ↗
                 </a></p>`
              : ""}
            ${f.notes ? `<p>${echapper(f.notes)}</p>` : ""}
            <p>${f.actif ? "Actif" : "Inactif"}</p>
            <button type="button"
              data-sk-action="modifier-fournisseur"
              data-id="${f.id}">Modifier</button>
            <button type="button"
              data-sk-action="supprimer-fournisseur"
              data-id="${f.id}">Supprimer</button>
          </article>
        `).join("")
      : "<p>Aucun fournisseur enregistré pour le moment.</p>";

    return fournisseurs;
  }


  async function sauvegarderFournisseur(formulaire) {
    const donnees = new FormData(formulaire);
    const id = donnees.get("id") || null;
    const nom = String(donnees.get("nom") || "").trim();

    if (!nom) throw new Error("Indique le nom du fournisseur.");

    const site = verifierUrl(
      String(donnees.get("site_url") || "").trim()
    );

    await enregistrer(TABLES.fournisseurs, {
      nom,
      site_url: site,
      contact: String(donnees.get("contact") || "").trim() || null,
      notes: String(donnees.get("notes") || "").trim() || null,
      actif: donnees.get("actif") !== "false"
    }, id);

    formulaire.reset();
    const champId = formulaire.querySelector('[name="id"]');
    if (champId) champId.value = "";

    afficherMessage("Fournisseur enregistré.");
    await chargerFournisseurs();
  }

  /* ---------------- CONSOMMABLES ---------------- */

  async function chargerConsommables() {
    const [consommables, fournisseurs] = await Promise.all([
      lire(TABLES.consommables,
        "id,nom,unite,stock_actuel,seuil_alerte,prix_unitaire,fournisseur_id,url_achat,notes,actif"),
      lire(TABLES.fournisseurs, "id,nom")
    ]);

    const nomsFournisseurs = Object.fromEntries(
      fournisseurs.map(f => [f.id, f.nom])
    );

    const zone = document.getElementById("skConsommablesListe");
    if (!zone) return consommables;

    zone.innerHTML = consommables.length
      ? consommables.map(c => {
          const alerte =
            nombre(c.stock_actuel) <= nombre(c.seuil_alerte);

          return `
            <article class="sk-carte">
              <strong>${echapper(c.nom)}</strong>
              <p>Stock : ${nombre(c.stock_actuel)}
                ${echapper(c.unite || "pièce")}</p>
              <p>Coût unitaire : ${euro(c.prix_unitaire)}</p>
              <p>Fournisseur :
                ${echapper(nomsFournisseurs[c.fournisseur_id] || "Non renseigné")}
              </p>
              ${alerte
                ? '<p class="sk-alerte">Stock bas : pensez à réapprovisionner.</p>'
                : ""}
              ${c.url_achat
                ? `<p><a href="${echapper(c.url_achat)}"
                     target="_blank" rel="noopener noreferrer">
                     Retrouver l’article ↗
                   </a></p>`
                : ""}
              <button type="button" data-sk-action="ajuster-stock"
                data-id="${c.id}" data-sens="ajouter">+ Ajouter au stock</button>
              <button type="button" data-sk-action="ajuster-stock"
                data-id="${c.id}" data-sens="retirer">− Retirer du stock</button>
              <button type="button" data-sk-action="modifier-consommable"
                data-id="${c.id}">Modifier</button>
              <button type="button" data-sk-action="supprimer-consommable"
                data-id="${c.id}">Supprimer</button>
            </article>
          `;
        }).join("")
      : "<p>Aucun consommable enregistré pour le moment.</p>";

    return consommables;
  }

  async function sauvegarderConsommable(formulaire) {
    const donnees = new FormData(formulaire);
    const id = donnees.get("id") || null;
    const nom = String(donnees.get("nom") || "").trim();

    if (!nom) throw new Error("Indique le nom du consommable.");

    const stock = nombre(donnees.get("stock_actuel"));
    const seuil = nombre(donnees.get("seuil_alerte"));
    const prix = nombre(donnees.get("prix_unitaire"));

    if (stock < 0 || seuil < 0 || prix < 0) {
      throw new Error("Les quantités et coûts ne peuvent pas être négatifs.");
    }

    await enregistrer(TABLES.consommables, {
      nom,
      unite: String(donnees.get("unite") || "piece"),
      stock_actuel: stock,
      seuil_alerte: seuil,
      prix_unitaire: prix,
      fournisseur_id: donnees.get("fournisseur_id") || null,
      url_achat: verifierUrl(
        String(donnees.get("url_achat") || "").trim()
      ),
      notes: String(donnees.get("notes") || "").trim() || null,
      actif: true
    }, id);

    formulaire.reset();
    const champId = formulaire.querySelector('[name="id"]');
    if (champId) champId.value = "";

    afficherMessage("Consommable enregistré.");
    await chargerConsommables();
  }

  async function ajusterStock(id, sens) {
    const consommables = await lire(TABLES.consommables, "*");
    const article = consommables.find(c => c.id === id);

    if (!article) throw new Error("Consommable introuvable.");

    const saisie = prompt(
      `Quantité à ${sens === "ajouter" ? "ajouter" : "retirer"} pour ${article.nom} :`,
      "1"
    );

    if (saisie === null) return;

    const quantite = nombre(saisie);
    if (quantite <= 0) {
      throw new Error("Saisis une quantité supérieure à zéro.");
    }

    const nouveauStock = nombre(article.stock_actuel) +
      (sens === "ajouter" ? quantite : -quantite);

    if (nouveauStock < 0) {
      throw new Error("Stock insuffisant : le stock ne peut pas devenir négatif.");
    }

    await enregistrer(TABLES.consommables, {
      stock_actuel: nouveauStock
    }, id);

    afficherMessage("Stock mis à jour.");
    await chargerConsommables();
  }

  /* ---------------- ACHATS FOURNISSEURS ---------------- */

   // REPÈRE — GESTION DES LIGNES D'ARTICLES D'UN ACHAT
function initialiserLignesArticlesAchat() {
  const conteneur = document.getElementById("skAchatArticles");
  const boutonAjouter = document.getElementById("skAjouterArticle");

  if (!conteneur || !boutonAjouter || boutonAjouter.dataset.initialise === "oui") {
    return;
  }

  boutonAjouter.dataset.initialise = "oui";

  function actualiserNumeros() {
    conteneur.querySelectorAll(".sk-achat-article").forEach((ligne, index) => {
      ligne.dataset.articleIndex = index;

      const titre = ligne.querySelector("h5");
      if (titre) titre.textContent = `Article ${index + 1}`;

      const boutonSupprimer = ligne.querySelector(".sk-supprimer-article");
      if (boutonSupprimer) {
        boutonSupprimer.disabled =
          conteneur.querySelectorAll(".sk-achat-article").length === 1;
      }
    });
  }

  boutonAjouter.addEventListener("click", () => {
    const modele = conteneur.querySelector(".sk-achat-article");
    if (!modele) return;

    const nouvelleLigne = modele.cloneNode(true);

    nouvelleLigne.querySelectorAll("input, textarea").forEach(champ => {
      if (champ.name === "ligne_id") {
        champ.value = "";
      } else if (champ.name === "quantite") {
        champ.value = "1";
      } else if (champ.name === "prix_unitaire" ||
                 champ.name === "quantite_recue") {
        champ.value = "0";
      } else {
        champ.value = "";
      }
    });

    const selectType = nouvelleLigne.querySelector('select[name="type_article"]');
    if (selectType) selectType.value = "autre";

    conteneur.appendChild(nouvelleLigne);
    actualiserNumeros();
    nouvelleLigne.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  conteneur.addEventListener("click", evenement => {
    const bouton = evenement.target.closest(".sk-supprimer-article");
    if (!bouton) return;

    const lignes = conteneur.querySelectorAll(".sk-achat-article");

    if (lignes.length <= 1) {
      afficherMessage("Garde au moins une ligne dans le formulaire.", true);
      return;
    }

    const ligne = bouton.closest(".sk-achat-article");
    const idLigne = ligne?.querySelector('[name="ligne_id"]')?.value;

    
if (idLigne) {
  const champSuppressions = document.getElementById(
    "skLignesAchatsSupprimees"
  );

  if (!champSuppressions) {
    afficherMessage(
      "Impossible de sécuriser la suppression : champ de suivi introuvable.",
      true
    );
    return;
  }

  let idsASupprimer = [];

  try {
    idsASupprimer = JSON.parse(champSuppressions.value || "[]");

    if (!Array.isArray(idsASupprimer)) {
      idsASupprimer = [];
    }
  } catch {
    idsASupprimer = [];
  }

  if (!idsASupprimer.includes(idLigne)) {
    idsASupprimer.push(idLigne);
  }

  champSuppressions.value = JSON.stringify(idsASupprimer);

  ligne?.remove();
  actualiserNumeros();

  afficherMessage(
    "Article marqué pour suppression. La suppression sera appliquée à l'enregistrement."
  );
  return;
}

    ligne?.remove();
    actualiserNumeros();
  });

  actualiserNumeros();
}
   
  async function chargerAchats() {
    const [achats, fournisseurs, lignes] = await Promise.all([
      lire(TABLES.achats, "*"),
      lire(TABLES.fournisseurs, "id,nom"),
      lire(TABLES.lignesAchats, "*")
    ]);

    const noms = Object.fromEntries(
      fournisseurs.map(f => [f.id, f.nom])
    );

    const zone = document.getElementById("skAchatsListe");
    if (!zone) return achats;

    zone.innerHTML = achats.length
      ? achats.map(a => {
          const lignesAchat = lignes.filter(l => l.achat_id === a.id);
          const totalArticles = lignesAchat.reduce(
            (somme, l) =>
              somme + nombre(l.quantite) * nombre(l.prix_unitaire),
            0
          );
          const total = totalArticles +
            nombre(a.frais_livraison) + nombre(a.frais_autres);

          return `
            <article class="sk-carte">
              <strong>Commande fournisseur :
                ${echapper(a.reference || "Sans référence")}</strong>
              <p>Fournisseur :
                ${echapper(noms[a.fournisseur_id] || "Non renseigné")}</p>
              <p>Date : ${echapper(a.date_commande || "Non renseignée")}</p>
              <p>Statut : ${echapper(a.statut)}</p>
              <p>Paiement : ${echapper(a.statut_paiement)}</p>
              <p>Articles : ${euro(totalArticles)}</p>
              <p>Livraison : ${euro(a.frais_livraison)}</p>
              <p>Autres frais : ${euro(a.frais_autres)}</p>
              <strong>Total estimé : ${euro(total)}</strong>
              ${a.notes ? `<p>${echapper(a.notes)}</p>` : ""}
              <button type="button" data-sk-action="modifier-achat"
                data-id="${a.id}">Modifier</button>
            </article>
          `;
        }).join("")
      : "<p>Aucun achat fournisseur enregistré pour le moment.</p>";

    return achats;
  }

  async function sauvegarderAchat(formulaire) {
const donnees = new FormData(formulaire);
const id = donnees.get("id") || null;

const livraison = nombre(donnees.get("frais_livraison"));
const autres = nombre(donnees.get("frais_autres"));

if (livraison < 0 || autres < 0) {
throw new Error("Les frais ne peuvent pas être négatifs.");
}

const achat = {
fournisseur_id: donnees.get("fournisseur_id") || null,
reference: String(donnees.get("reference") || "").trim() || null,
date_commande: donnees.get("date_commande") || null,
date_reception: donnees.get("date_reception") || null,
statut: donnees.get("statut") || "a_commander",
statut_paiement: donnees.get("statut_paiement") || "a_payer",
frais_livraison: livraison,
frais_autres: autres,
notes: String(donnees.get("notes") || "").trim() || null
};

const resultat = await enregistrer(TABLES.achats, achat, id);
const achatId = id || resultat?.[0]?.id;

if (!achatId) {
throw new Error(
"L'achat est enregistré, mais son identifiant est introuvable."
);
}

const conteneur = formulaire.querySelector("#skAchatArticles");
const lignesFormulaire = conteneur
? [...conteneur.querySelectorAll(".sk-achat-article")]
: [];

const client = obtenirClient();
     
const champSuppressions = document.getElementById(
  "skLignesAchatsSupprimees"
);

let idsASupprimer = [];

if (champSuppressions && champSuppressions.value.trim()) {
  try {
    idsASupprimer = JSON.parse(champSuppressions.value);

    if (
      !Array.isArray(idsASupprimer) ||
      !idsASupprimer.every(
        id => typeof id === "string" && id.trim() !== ""
      )
    ) {
      throw new Error("Liste de suppressions invalide.");
    }

    idsASupprimer = [...new Set(idsASupprimer)];
  } catch {
    throw new Error(
      "La liste des articles à supprimer est invalide. Recharge l'achat avant de réessayer."
    );
  }
}

if (idsASupprimer.length > 0) {
  if (!id) {
    throw new Error(
      "Impossible de supprimer des articles : l'achat n'a pas d'identifiant."
    );
  }

  const verificationSuppressions = await client
    .from(TABLES.lignesAchats)
    .select("id, achat_id")
    .in("id", idsASupprimer);

  if (verificationSuppressions.error) {
    throw new Error(
      "Impossible de vérifier les articles à supprimer : " +
      verificationSuppressions.error.message
    );
  }

  const lignesVerifiees = verificationSuppressions.data || [];

  if (
    lignesVerifiees.length !== idsASupprimer.length ||
    lignesVerifiees.some(ligne => ligne.achat_id !== achatId)
  ) {
    throw new Error(
      "Sécurité : au moins un article à supprimer est introuvable ou n'appartient pas à cet achat. Aucune suppression effectuée."
    );
  }
}

  for (const [index, ligne] of lignesFormulaire.entries()) {
    const lireChamp = nom =>
      String(ligne.querySelector(`[name="${nom}"]`)?.value || "").trim();

    const nomArticle = lireChamp("nom_article");
    const urlArticle = lireChamp("url_article");
    const typeArticle = lireChamp("type_article");
    const quantiteBrute = lireChamp("quantite");
    const prixBrut = lireChamp("prix_unitaire");
    const recueBrute = lireChamp("quantite_recue");
    const notesArticle = lireChamp("notes_article");
    const ligneId = lireChamp("ligne_id") || null;

    const ligneVide =
      !nomArticle &&
      !urlArticle &&
      !notesArticle &&
      (!quantiteBrute || quantiteBrute === "1") &&
      (!prixBrut || nombre(prixBrut) === 0) &&
      (!recueBrute || nombre(recueBrute) === 0);

    if (ligneVide) continue;

    if (!nomArticle) {
      throw new Error(
        `Article ${index + 1} : indique le nom de l'article.`
      );
    }

    const quantite = nombre(quantiteBrute);
    const prixUnitaire = nombre(prixBrut);
    const quantiteRecue = nombre(recueBrute);

    if (quantite <= 0) {
      throw new Error(
        `Article ${index + 1} : la quantité doit être supérieure à zéro.`
      );
    }

    if (prixUnitaire < 0 || quantiteRecue < 0) {
      throw new Error(
        `Article ${index + 1} : le prix et la quantité reçue ne peuvent pas être négatifs.`
      );
    }

    if (quantiteRecue > quantite) {
      throw new Error(
        `Article ${index + 1} : la quantité reçue ne peut pas dépasser la quantité commandée.`
      );
    }

    const valeursArticle = {
      achat_id: achatId,
      nom_article: nomArticle,
      url_article: verifierUrl(urlArticle),
      type_article: typeArticle || "autre",
      quantite,
      prix_unitaire: prixUnitaire,
      quantite_recue: quantiteRecue,
      notes: notesArticle || null
    };

    let resultatArticle;

    
if (ligneId) {
  resultatArticle = await client
    .from(TABLES.lignesAchats)
    .update(valeursArticle)
    .eq("id", ligneId)
    .eq("achat_id", achatId)
    .select("id");

  if (
    !resultatArticle.error &&
    (!resultatArticle.data || resultatArticle.data.length !== 1)
  ) {
    throw new Error(
      `Sécurité : l'article ${index + 1} n'a pas été modifié. ` +
      "Il est peut-être introuvable ou la modification est refusée."
    );
  }
} else {
  resultatArticle = await client
    .from(TABLES.lignesAchats)
    .insert(valeursArticle);
}

    if (resultatArticle.error) {
      throw new Error(
        `Achat enregistré, mais erreur sur l'article ${index + 1} : ` +
        resultatArticle.error.message
      );
    }
  }


if (idsASupprimer.length > 0) {
  const resultatSuppression = await client
    .from(TABLES.lignesAchats)
    .delete()
    .eq("achat_id", achatId)
    .in("id", idsASupprimer)
    .select("id");

  if (resultatSuppression.error) {
    throw new Error(
      "Les articles ont été enregistrés, mais la suppression de certaines lignes a échoué : " +
      resultatSuppression.error.message
    );
  }

  const idsSupprimes = (resultatSuppression.data || []).map(
    ligne => ligne.id
  );

  if (
    idsSupprimes.length !== idsASupprimer.length ||
    idsASupprimer.some(idSupprime => !idsSupprimes.includes(idSupprime))
  ) {
    throw new Error(
      "La suppression n'a pas pu être confirmée pour tous les articles. Recharge l'achat et vérifie les lignes restantes."
    );
  }
}

if (champSuppressions) {
  champSuppressions.value = "[]";
}

  formulaire.reset();

  const champId = formulaire.querySelector('[name="id"]');
  if (champId) champId.value = "";

  afficherMessage("Achat fournisseur et articles enregistrés.");

  await chargerAchats();
}

  /* ---------------- COÛT DE REVIENT ---------------- */

  function calculerPrixConseillé(couts) {
    const coutBase =
      nombre(couts.cout_support) +
      nombre(couts.cout_livraison) +
      nombre(couts.cout_consommables) +
      nombre(couts.cout_emballage) +
      nombre(couts.cout_electricite) +
      nombre(couts.cout_temps_travail) +
      nombre(couts.cout_autres);

    const tauxPaiement = nombre(couts.taux_frais_paiement) / 100;
    const fraisFixes = nombre(couts.frais_paiement_fixe);
    const tauxCharges = nombre(couts.taux_charges_estime) / 100;
    const marge = nombre(couts.taux_marge_cible) / 100;

    const denominateur = 1 - tauxPaiement - tauxCharges - marge;

    if (denominateur <= 0) {
      throw new Error(
        "La somme des taux de frais, charges et marge doit être inférieure à 100 %."
      );
    }

    return (coutBase + fraisFixes) / denominateur;
  }

  
async function chargerCoutsProduits() {
  const [produits, couts] = await Promise.all([
    lire("products", "id,nom,prix,lien_achat_fournisseur,prix_achat_fournisseur,prix_achat_verifie_le"),
    lire(TABLES.couts, "*")
  ]);

  const parProduit = Object.fromEntries(
    couts.map(c => [c.produit_id, c])
  );

  const zone = document.getElementById("skCoutsProduitsListe");
  if (!zone) return { produits, couts };

  function afficherListe() {
    const recherche = (
      document.getElementById("skRechercheCoutProduit")?.value || ""
    ).trim().toLocaleLowerCase("fr");

    const filtre =
      document.getElementById("skFiltreCoutProduit")?.value || "tous";

    const produitsFiltres = produits.filter(p => {
      const nom = String(p.nom || "").toLocaleLowerCase("fr");
      const c = parProduit[p.id];

      const coutRenseigne = c
        ? [
            c.cout_support,
            c.cout_livraison,
            c.cout_consommables,
            c.cout_emballage,
            c.cout_electricite,
            c.cout_temps_travail,
            c.cout_autres
          ].some(v => v !== null && v !== undefined && v !== "")
        : false;

      const correspondRecherche = nom.includes(recherche);
      const correspondFiltre =
        filtre === "tous" ||
        (filtre === "a-completer" && !coutRenseigne) ||
        (filtre === "renseigne" && coutRenseigne);

      return correspondRecherche && correspondFiltre;
    });

    if (!produitsFiltres.length) {
      zone.innerHTML = "<p>Aucun article correspondant.</p>";
      return;
    }

    zone.innerHTML = produitsFiltres.map(p => {
      const c = parProduit[p.id];

      const valeursCout = c
        ? [
            c.cout_support,
            c.cout_livraison,
            c.cout_consommables,
            c.cout_emballage,
            c.cout_electricite,
            c.cout_temps_travail,
            c.cout_autres
          ]
        : [];

      const cout = c
        ? valeursCout.reduce((total, valeur) => total + nombre(valeur), 0)
        : null;

      const coutRenseigne = valeursCout.some(
        valeur => valeur !== null &&
          valeur !== undefined &&
          valeur !== ""
      );

      const statut = coutRenseigne
        ? "Coût renseigné"
        : "À compléter";

      return `
        <details class="sk-carte sk-cout-produit"
          style="margin:6px 0;padding:10px 12px;">
          
         
          
<summary style="cursor:pointer;display:block;width:100%;box-sizing:border-box;">
  <div style="display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;width:100%;box-sizing:border-box;">
    <strong style="min-width:0;overflow-wrap:anywhere;">
      ${echapper(p.nom || "Article sans nom")}
    </strong>

    <span style="white-space:nowrap;text-align:center;font-size:0.8em;">
      ${(() => {
        try {
          const lien = verifierUrl(p.lien_achat_fournisseur);
          return lien
            ? `<a href="${echapper(lien)}" target="_blank" rel="noopener noreferrer">Achat ↗</a>`
            : `<span style="opacity:0.6;">Sans lien</span>`;
        } catch {
          return `<span style="opacity:0.6;">Lien invalide</span>`;
        }
      })()}
    </span>

    <span style="white-space:nowrap;text-align:right;font-size:0.95em;font-weight:600;">
      ${euro(p.prix)}
    </span>
  </div>

  <div style="margin-top:5px;font-size:0.8em;opacity:0.8;">
    ${statut}
  </div>
</summary>

          <div style="padding-top:10px;">
          
            <div style="margin:10px 0;padding:10px;border:1px solid #ddd;border-radius:8px;">
              <label for="lienAchat-${p.id}" style="display:block;margin-bottom:6px;font-weight:600;">
                🔗 Lien d'achat fournisseur
              </label>
              <input
                type="url"
                id="lienAchat-${p.id}"
                value="${echapper(p.lien_achat_fournisseur || "")}"
                placeholder="https://..."
                style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:6px;"
              >
              <button
                type="button"
                data-sk-action="enregistrer-lien-produit"
                data-id="${p.id}"
                style="margin-top:8px;">
                Enregistrer le lien
              </button>
              
              <button
                type="button"
                data-sk-action="actualiser-prix-fournisseur"
                data-id="${p.id}"
                style="margin-top:8px;margin-left:6px;">
                🔄 Actualiser le prix fournisseur
              </button>
              <p id="prixFournisseur-${p.id}" style="margin-top:8px;font-size:0.9em;">
                Prix d'achat : ${p.prix_achat_fournisseur != null
                  ? euro(p.prix_achat_fournisseur)
                  : "Non renseigné"}
              </p>
            </div>
            <p>Prix actuel de la boutique : ${euro(p.prix)}</p>
            <p>Coût de revient :
              ${coutRenseigne ? euro(cout) : "À compléter"}</p>
            <p>Prix conseillé :
              ${c && c.prix_vente_conseille != null
                ? euro(c.prix_vente_conseille)
                : "À calculer"}</p>

            <button type="button"
              data-sk-action="editer-cout"
              data-id="${p.id}">
              Configurer le coût
            </button>
          </div>
        </details>
      `;
    }).join("");
  }

  const rechercheInput = document.getElementById("skRechercheCoutProduit");
  const filtreSelect = document.getElementById("skFiltreCoutProduit");

  if (rechercheInput && rechercheInput.dataset.coutsEcoute !== "oui") {
    rechercheInput.addEventListener("input", afficherListe);
    rechercheInput.dataset.coutsEcoute = "oui";
  }

  if (filtreSelect && filtreSelect.dataset.coutsEcoute !== "oui") {
    filtreSelect.addEventListener("change", afficherListe);
    filtreSelect.dataset.coutsEcoute = "oui";
  }

  afficherListe();

  return { produits, couts };
}

  async function sauvegarderCout(formulaire) {
    const donnees = new FormData(formulaire);
    const produitId = donnees.get("produit_id");

    if (!produitId) throw new Error("Sélectionne un produit.");

    const champsNumeriques = [
      "cout_support", "cout_livraison", "cout_consommables",
      "cout_emballage", "cout_electricite", "cout_temps_travail",
      "cout_autres", "taux_frais_paiement", "frais_paiement_fixe",
      "taux_charges_estime", "taux_marge_cible"
    ];

    const valeurs = {};
    for (const champ of champsNumeriques) {
      valeurs[champ] = nombre(donnees.get(champ));
      if (valeurs[champ] < 0) {
        throw new Error("Les coûts et taux ne peuvent pas être négatifs.");
      }
    }

    const prix = calculerPrixConseillé(valeurs);

    const existants = await lire(TABLES.couts, "id,produit_id");
    const existant = existants.find(c => c.produit_id === produitId);

    valeurs.produit_id = produitId;
    valeurs.prix_vente_conseille = Math.ceil(prix * 100) / 100;
    valeurs.updated_at = new Date().toISOString();
    valeurs.notes = String(donnees.get("notes") || "").trim() || null;

    await enregistrer(
      TABLES.couts,
      valeurs,
      existant ? existant.id : null
    );

    formulaire.reset();
    afficherMessage(
      `Coût enregistré. Prix conseillé : ${euro(valeurs.prix_vente_conseille)}. Le prix de la boutique n'a pas été modifié.`
    );
    await chargerCoutsProduits();
  }

  /* ---------------- CHARGEMENT GÉNÉRAL ---------------- */

  async function chargerGestion() {
  await securiser(async () => {
    obtenirClient();
    initialiserLignesArticlesAchat();

    await Promise.all([
      chargerFournisseurs(),
      chargerConsommables(),
      chargerAchats(),
      chargerCoutsProduits()
    ]);
  });
}

  /* ---------------- ACTIONS DE L'INTERFACE ---------------- */

  // REPÈRE — ENREGISTREMENT DIRECT DES FORMULAIRES DE GESTION
  const formulairesGestion = {
    skFormFournisseur: sauvegarderFournisseur,
    skFormConsommable: sauvegarderConsommable,
    skFormAchat: sauvegarderAchat,
    skFormCout: sauvegarderCout
  };

  Object.entries(formulairesGestion).forEach(([id, action]) => {
    const formulaire = document.getElementById(id);

    if (!formulaire || formulaire.dataset.skEnvoiBranche === "oui") {
      return;
    }

    formulaire.addEventListener("submit", async evenement => {
      evenement.preventDefault();
      evenement.stopPropagation();

      afficherMessage("Enregistrement en cours…");

      try {
        await action(formulaire);
      } catch (erreur) {
        console.error("Erreur enregistrement formulaire :", erreur);

        afficherMessage(
          erreur?.message ||
            "L’enregistrement a échoué. Vérifie les champs et les autorisations.",
          true
        );
      }
    });

    formulaire.dataset.skEnvoiBranche = "oui";
  });

  document.addEventListener("click", evenement => {
    const cible = evenement.target;

    if (!(cible instanceof Element)) return;

    const bouton = cible.closest('button[data-sk-action]');
    if (!bouton) return;

    const id = bouton.dataset.id;
    const action = bouton.dataset.skAction;

    securiser(async () => {
      if (action === "ajuster-stock") {
        await ajusterStock(id, bouton.dataset.sens);
        return;
      }
       

      if (action === "enregistrer-lien-produit") {
        const champ = document.getElementById(`lienAchat-${id}`);
        if (!champ) {
          throw new Error("Champ du lien fournisseur introuvable.");
        }

         const lienSaisi = champ.value.trim();
        const lien = lienSaisi ? verifierUrl(lienSaisi) : null;

        const { error } = await obtenirClient()
          .from("products")
          .update({ lien_achat_fournisseur: lien })
          .eq("id", id);

        if (error) throw error;

        afficherMessage("Lien d'achat fournisseur enregistré.");
        await chargerCoutsProduits();
        return;
      }

       if (action === "enregistrer-prix-fournisseur") {
  const prix = Number(bouton.dataset.prix);
  const date = bouton.dataset.date || new Date().toISOString();

  if (!Number.isFinite(prix) || prix < 0) {
    throw new Error("Le prix détecté est invalide.");
  }

  const { error } = await obtenirClient()
    .from("products")
    .update({
      prix_achat_fournisseur: prix,
      prix_achat_verifie_le: date
    })
    .eq("id", id);

  if (error) throw error;

  const affichage = document.getElementById(`prixFournisseur-${id}`);

  if (affichage) {
    affichage.textContent =
      `Prix d'achat enregistré : ${euro(prix)} — vérifié le ${new Date(date).toLocaleDateString("fr-FR")}.`;
  }

  afficherMessage("Prix d'achat fournisseur enregistré. Le prix de vente reste inchangé.");
  return;
}
       
      if (action === "actualiser-prix-fournisseur") {
        const champ = document.getElementById(`lienAchat-${id}`);
        const affichage = document.getElementById(`prixFournisseur-${id}`);

        if (!champ || !champ.value.trim()) {
          throw new Error("Ajoute d'abord le lien du fournisseur.");
        }

        affichage.textContent = "Récupération du prix en cours…";

        
        const resultat = await Promise.race([
          obtenirClient().functions.invoke("recuperer-prix-fournisseur", {
            body: { url: champ.value.trim() }
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(
              "Délai dépassé : Supabase ne répond pas. Réessaie."
            )), 15000)
          )
        ]);

        const { data, error } = resultat;

        if (error) {
          affichage.textContent =
            "Erreur Supabase : " + (error.message || "appel impossible");
          return;
        }

        if (data?.error) {
          affichage.textContent = data.error;
          return;
        }

        if (typeof data?.price !== "number") {
          throw new Error("Aucun prix fiable n'a été détecté.");
        }

        affichage.innerHTML = `
  <p>
    Prix détecté :
    <strong>${euro(data.price)}</strong>
  </p>
  <p>Vérifie le prix avant de l'enregistrer.</p>
  <button
    type="button"
    data-sk-action="enregistrer-prix-fournisseur"
    data-id="${id}"
    data-prix="${data.price}"
    data-date="${echapper(data.checkedAt || new Date().toISOString())}"
    style="margin-top:8px;">
    ✅ Enregistrer ce prix vérifié
  </button>
`;

return;
      }

      if (action === "supprimer-fournisseur") {
        if (!confirm("Supprimer ce fournisseur ?")) return;
        await supprimer(TABLES.fournisseurs, id);
        afficherMessage("Fournisseur supprimé.");
        await chargerFournisseurs();
        return;
      }

      if (action === "supprimer-consommable") {
        if (!confirm("Supprimer ce consommable ?")) return;
        await supprimer(TABLES.consommables, id);
        afficherMessage("Consommable supprimé.");
        await chargerConsommables();
        return;
      }

      
      if (action === "editer-cout") {
        const formulaire = document.getElementById("skFormCout");
        const selectProduit = document.getElementById("skCoutProduit");

        if (!formulaire || !selectProduit) {
          throw new Error("Le formulaire de coût est introuvable dans admin.html.");
        }

        const [produits, couts] = await Promise.all([
          lire("products", "id,nom"),
          lire(TABLES.couts, "*")
        ]);

        selectProduit.innerHTML =
          '<option value="">Choisir un produit</option>' +
          produits.map(p => `
            <option value="${echapper(p.id)}">
              ${echapper(p.nom || "Article sans nom")}
            </option>
          `).join("");

        const coutExistant = couts.find(c => c.produit_id === id);

        selectProduit.value = id;

        const champs = [
          "cout_support",
          "cout_livraison",
          "cout_consommables",
          "cout_emballage",
          "cout_electricite",
          "cout_temps_travail",
          "cout_autres",
          "taux_frais_paiement",
          "frais_paiement_fixe",
          "taux_charges_estime",
          "taux_marge_cible",
          "notes"
        ];

        champs.forEach(nom => {
          const champ = formulaire.elements.namedItem(nom);
          if (!champ) return;

          if (coutExistant) {
            champ.value = coutExistant[nom] ?? (nom === "taux_marge_cible" ? 30 : 0);
          } else {
            champ.value = nom === "taux_marge_cible" ? 30 : (nom === "notes" ? "" : 0);
          }
        });

        formulaire.style.display = "block";
        formulaire.scrollIntoView({ behavior: "smooth", block: "start" });
        afficherMessage("Renseigne les coûts de ce produit, puis enregistre.");
        return;
      }

      
if (action === "modifier-fournisseur") {
  const formulaire = document.getElementById("skFormFournisseur");

  if (!formulaire) {
    throw new Error("Le formulaire fournisseur est introuvable.");
  }

  const fournisseurs = await lire(
    TABLES.fournisseurs,
    "id,nom,site_url,contact,notes,actif"
  );

  const fournisseur = fournisseurs.find(f => f.id === id);

  if (!fournisseur) {
    throw new Error("Ce fournisseur est introuvable.");
  }

  formulaire.elements.namedItem("id").value = fournisseur.id;
  formulaire.elements.namedItem("nom").value = fournisseur.nom || "";
  formulaire.elements.namedItem("site_url").value =
    fournisseur.site_url || "";
  formulaire.elements.namedItem("contact").value =
    fournisseur.contact || "";
  formulaire.elements.namedItem("notes").value =
    fournisseur.notes || "";
  formulaire.elements.namedItem("actif").value =
    String(fournisseur.actif);

  formulaire.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  afficherMessage(
    "Fournisseur chargé : modifie les informations puis enregistre."
  );

  return;
}

       
if (action === "modifier-consommable") {
  const formulaire = document.getElementById("skFormConsommable");

  if (!formulaire) {
    throw new Error("Le formulaire consommable est introuvable.");
  }

  const consommables = await lire(TABLES.consommables, "*");
  const consommable = consommables.find(c => c.id === id);

  if (!consommable) {
    throw new Error("Ce consommable est introuvable.");
  }

  [
    "id",
    "nom",
    "unite",
    "stock_actuel",
    "seuil_alerte",
    "prix_unitaire",
    "fournisseur_id",
    "url_achat",
    "notes"
  ].forEach(nom => {
    const champ = formulaire.elements.namedItem(nom);
    if (champ) champ.value = consommable[nom] ?? "";
  });

  formulaire.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  afficherMessage(
    "Consommable chargé : modifie les informations puis enregistre."
  );

  return;
}

if (action === "modifier-achat") {
  const formulaire = document.getElementById("skFormAchat");

  if (!formulaire) {
    throw new Error("Le formulaire d'achat est introuvable.");
  }

  const [achats, toutesLesLignes] = await Promise.all([
    lire(TABLES.achats, "*"),
    lire(TABLES.lignesAchats, "*")
  ]);

  const achat = achats.find(a => a.id === id);

  if (!achat) {
    throw new Error("Cet achat fournisseur est introuvable.");
  }

  const champsAchat = [
    "id",
    "fournisseur_id",
    "reference",
    "date_commande",
    "date_reception",
    "statut",
    "statut_paiement",
    "frais_livraison",
    "frais_autres",
    "notes"
  ];

  champsAchat.forEach(nom => {
    const champ = formulaire.elements.namedItem(nom);
    if (champ) champ.value = achat[nom] ?? "";
  });

  const conteneur = formulaire.querySelector("#skAchatArticles");

  if (!conteneur) {
    throw new Error(
      "Le conteneur des articles est introuvable dans le formulaire."
    );
  }

   const champSuppressions = document.getElementById(
  "skLignesAchatsSupprimees"
);

if (champSuppressions) {
  champSuppressions.value = "[]";
}
   
  const lignesAchat = toutesLesLignes.filter(
    ligne => ligne.achat_id === id
  );

  const modele = conteneur.querySelector(".sk-achat-article");

  if (!modele) {
    throw new Error("Le modèle de ligne d'article est introuvable.");
  }

  conteneur.replaceChildren();

  const lignesAAfficher = lignesAchat.length ? lignesAchat : [null];

  lignesAAfficher.forEach((article, index) => {
    const ligne = modele.cloneNode(true);

    ligne.dataset.articleIndex = index;

    const titre = ligne.querySelector("h5");
    if (titre) titre.textContent = `Article ${index + 1}`;

    const valeurs = {
      ligne_id: article?.id ?? "",
      nom_article: article?.nom_article ?? "",
      url_article: article?.url_article ?? "",
      type_article: article?.type_article ?? "autre",
      quantite: article?.quantite ?? 1,
      prix_unitaire: article?.prix_unitaire ?? 0,
      quantite_recue: article?.quantite_recue ?? 0,
      notes_article: article?.notes ?? ""
    };

    Object.entries(valeurs).forEach(([nom, valeur]) => {
      const champ = ligne.querySelector(`[name="${nom}"]`);
      if (champ) champ.value = valeur;
    });

    conteneur.appendChild(ligne);
  });

  const panneau = formulaire.closest("details");
  if (panneau) panneau.open = true;

  formulaire.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  afficherMessage(
    lignesAchat.length
      ? `Achat chargé avec ${lignesAchat.length} article(s).`
      : "Achat chargé. Tu peux ajouter ses premiers articles."
  );

  return;
}

if (action.startsWith("modifier-")) {
  afficherMessage(
    "La modification de cet élément sera raccordée dans une prochaine étape."
  );
}
    });
  });

  // Fermer le formulaire de coût avec le bouton Annuler.
  document.getElementById("skAnnulerCout")?.addEventListener("click", () => {
    const formulaire = document.getElementById("skFormCout");
    if (formulaire) {
      formulaire.style.display = "none";
      formulaire.reset();
    }
  });

  // Charger les coûts déjà enregistrés quand le produit change.
  document.getElementById("skCoutProduit")?.addEventListener("change", async evenement => {
    const formulaire = document.getElementById("skFormCout");
    const produitId = evenement.target.value;

    if (!formulaire || !produitId) return;

    await securiser(async () => {
      const couts = await lire(TABLES.couts, "*");
      const coutExistant = couts.find(c => c.produit_id === produitId);

      const champs = [
        "cout_support",
        "cout_livraison",
        "cout_consommables",
        "cout_emballage",
        "cout_electricite",
        "cout_temps_travail",
        "cout_autres",
        "taux_frais_paiement",
        "frais_paiement_fixe",
        "taux_charges_estime",
        "taux_marge_cible",
        "notes"
      ];

      champs.forEach(nom => {
        const champ = formulaire.elements.namedItem(nom);
        if (!champ) return;

        champ.value = coutExistant
          ? (coutExistant[nom] ?? (nom === "taux_marge_cible" ? 30 : 0))
          : (nom === "taux_marge_cible" ? 30 : 0);
      });
    });
  });

  // Chargement des données à l'ouverture de la section Achats & coûts.
  document
    .querySelectorAll('.menu-bouton[data-section="achats-couts"]')
    .forEach(bouton => {
      bouton.addEventListener("click", () => {
        void chargerGestion();
      });
    });

  // Fonctions accessibles pour le branchement dans l'administration.
  window.skChargerGestion = chargerGestion;
  window.skChargerFournisseurs = chargerFournisseurs;
  window.skChargerConsommables = chargerConsommables;
  window.skChargerAchats = chargerAchats;
  window.skChargerCoutsProduits = chargerCoutsProduits;
  window.skCalculerPrixConseille = calculerPrixConseillé;

     
})();
