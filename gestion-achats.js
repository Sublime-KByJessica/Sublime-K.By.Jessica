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

    if (resultat.error) throw resultat.error;
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

  /* ---------------- FOURNISSEURS ---------------- */

  async function chargerFournisseurs() {
    const fournisseurs = await lire(
      TABLES.fournisseurs,
      "id,nom,site_url,contact,notes,actif"
    );

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
            <button type="button" data-sk-action="modifier-fournisseur"
              data-id="${f.id}">Modifier</button>
            <button type="button" data-sk-action="supprimer-fournisseur"
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

  const resultat = await enregistrer(
    TABLES.achats,
    achat,
    id
  );

  const achatId = id || resultat?.[0]?.id;

  if (!achatId) {
    throw new Error(
      "L'achat a été enregistré, mais son identifiant est introuvable."
    );
  }

  const nomArticle = String(
    donnees.get("nom_article") || ""
  ).trim();

  if (nomArticle) {
    const quantite = nombre(donnees.get("quantite"));
    const prixUnitaire = nombre(donnees.get("prix_unitaire"));
    const quantiteRecue = nombre(donnees.get("quantite_recue"));

    if (quantite <= 0) {
      throw new Error(
        "La quantité de l'article doit être supérieure à zéro."
      );
    }

    if (prixUnitaire < 0 || quantiteRecue < 0) {
      throw new Error(
        "Le prix et la quantité reçue ne peuvent pas être négatifs."
      );
    }

    const { error } = await obtenirClient()
      .from(TABLES.lignesAchats)
      .insert({
        achat_id: achatId,
        nom_article: nomArticle,
        url_article: verifierUrl(
          String(donnees.get("url_article") || "").trim()
        ),
        type_article: donnees.get("type_article") || "autre",
        quantite,
        prix_unitaire: prixUnitaire,
        quantite_recue: quantiteRecue,
        notes: String(
          donnees.get("notes_article") || ""
        ).trim() || null
      });

    if (error) {
      throw new Error(
        "L'achat est enregistré, mais l'article n'a pas pu être ajouté : " +
        error.message
      );
    }
  }

  formulaire.reset();

  const champId = formulaire.querySelector('[name="id"]');
  if (champId) champId.value = "";

  afficherMessage(
    nomArticle
      ? "Achat fournisseur et article enregistrés."
      : "Achat fournisseur enregistré."
  );

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
      lire("products", "id,nom,prix"),
      lire(TABLES.couts, "*")
    ]);

    const parProduit = Object.fromEntries(
      couts.map(c => [c.produit_id, c])
    );

    const zone = document.getElementById("skCoutsProduitsListe");
    if (!zone) return { produits, couts };

    zone.innerHTML = produits.length
      ? produits.map(p => {
          const c = parProduit[p.id];
          const cout = c
            ? nombre(c.cout_support) +
              nombre(c.cout_livraison) +
              nombre(c.cout_consommables) +
              nombre(c.cout_emballage) +
              nombre(c.cout_electricite) +
              nombre(c.cout_temps_travail) +
              nombre(c.cout_autres)
            : null;

          return `
            <article class="sk-carte">
              <strong>${echapper(p.nom)}</strong>
              <p>Prix actuel de la boutique : ${euro(p.prix)}</p>
              <p>Coût de revient renseigné :
                ${cout === null ? "À compléter" : euro(cout)}</p>
              <p>Prix conseillé :
                ${c && c.prix_vente_conseille != null
                  ? euro(c.prix_vente_conseille)
                  : "À calculer"}</p>
              <button type="button" data-sk-action="editer-cout"
                data-id="${p.id}">Configurer le coût</button>
            </article>
          `;
        }).join("")
      : "<p>Aucun produit trouvé.</p>";

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
      await Promise.all([
        chargerFournisseurs(),
        chargerConsommables(),
        chargerAchats(),
        chargerCoutsProduits()
      ]);
    });
  }

  /* ---------------- ACTIONS DE L'INTERFACE ---------------- */

  document.addEventListener("submit", evenement => {
    const formulaire = evenement.target;
    if (!formulaire || !formulaire.id) return;

    const actions = {
      skFormFournisseur: sauvegarderFournisseur,
      skFormConsommable: sauvegarderConsommable,
      skFormAchat: sauvegarderAchat,
      skFormCout: sauvegarderCout
    };

    const action = actions[formulaire.id];
    if (!action) return;

    evenement.preventDefault();
    securiser(() => action(formulaire));
  });

  document.addEventListener("click", evenement => {
    const bouton = evenement.target.closest("[data-sk-action]");
    if (!bouton) return;

    const id = bouton.dataset.id;
    const action = bouton.dataset.skAction;

    securiser(async () => {
      if (action === "ajuster-stock") {
        await ajusterStock(id, bouton.dataset.sens);
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

      // Les boutons de modification seront reliés aux formulaires
      // lors de l'étape d'intégration de l'interface dans admin.html.
      if (action.startsWith("modifier-") || action === "editer-cout") {
        afficherMessage(
          "L'interface de modification sera reliée à cette action lors de l'étape suivante."
        );
      }
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
